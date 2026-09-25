import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

type GoogleCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

function responseHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

const reply = (request: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodePrivateKey(pem: string) {
  const encoded = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createAccessToken(credentials: GoogleCredentials) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const tokenUri = credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
  const encodedHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const encodedClaims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    decodePrivateKey(credentials.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsignedJwt),
  );
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);

  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error('Google token exchange returned no access token');
  cachedToken = {
    value: result.access_token,
    expiresAt: now + Math.min(result.expires_in ?? 3600, 3600),
  };
  return result.access_token;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(request) });
  if (request.method !== 'POST') return reply(request, 405, { error: 'Method not allowed' });

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return reply(request, 401, { error: 'Unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return reply(request, 401, { error: 'Unauthorized' });

  let documentId: string;
  let provider: string;
  try {
    const body = await request.json() as { documentId?: unknown; provider?: unknown };
    documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
    provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
  } catch {
    return reply(request, 400, { error: 'Invalid JSON body' });
  }
  if (!documentId) return reply(request, 400, { error: 'documentId is required' });
  if (provider !== 'google') {
    return reply(request, 400, {
      configured: true,
      mode: 'local',
      error: 'Cloud OCR was not selected. Use the free on-device OCR workflow.',
    });
  }

  const credentialsJson = Deno.env.get('GOOGLE_APPLICATION_CREDENTIALS_JSON');
  const configuredProjectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
  const location = Deno.env.get('GOOGLE_DOCUMENT_AI_LOCATION');
  const processorId = Deno.env.get('GOOGLE_DOCUMENT_AI_PROCESSOR_ID');
  if (!credentialsJson || !location || !processorId) {
    return reply(request, 503, {
      configured: false,
      provider: 'google',
      error: 'Google Document AI provider is not configured',
    });
  }

  const { data: document, error: documentError } = await client
    .from('customer_documents')
    .select('storage_path,mime_type,size_bytes')
    .eq('id', documentId)
    .single();
  if (documentError || !document) return reply(request, 404, { error: 'Document unavailable' });
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(document.mime_type)) {
    return reply(request, 415, { error: 'Unsupported document type' });
  }
  if (document.size_bytes > 20 * 1024 * 1024) return reply(request, 413, { error: 'Document exceeds the OCR size limit' });

  const { data: file, error: downloadError } = await client.storage
    .from('customer-documents')
    .download(document.storage_path);
  if (downloadError || !file) return reply(request, 404, { error: 'Document file unavailable' });

  await client.from('customer_documents').update({ ocr_status: 'pending' }).eq('id', documentId);

  try {
    const credentials = JSON.parse(credentialsJson) as GoogleCredentials;
    if (!credentials.client_email || !credentials.private_key) throw new Error('Google credentials are incomplete');
    const projectId = configuredProjectId || credentials.project_id;
    if (!projectId) throw new Error('Google project ID is missing');

    const accessToken = await createAccessToken(credentials);
    const content = base64(new Uint8Array(await file.arrayBuffer()));
    const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/processors/${encodeURIComponent(processorId)}:process`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawDocument: { content, mimeType: document.mime_type } }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      const providerError = await response.json().catch(() => null) as {
        error?: { status?: string; message?: string };
      } | null;
      const providerStatus = providerError?.error?.status ?? 'UNKNOWN';
      const providerMessage = (providerError?.error?.message ?? 'No provider message').slice(0, 300);
      throw new Error(`Document AI request failed (${response.status} ${providerStatus}): ${providerMessage}`);
    }

    const extraction = await response.json();
    const { error: updateError } = await client
      .from('customer_documents')
      .update({ ocr_status: 'extracted', ocr_result: extraction })
      .eq('id', documentId);
    if (updateError) throw new Error('OCR result could not be saved');

    console.info(JSON.stringify({ event: 'ocr_document_succeeded', documentId, actorId: userData.user.id }));
    return reply(request, 200, { configured: true, extraction, requiresReview: true });
  } catch (error) {
    await client.from('customer_documents').update({ ocr_status: 'failed' }).eq('id', documentId);
    console.error(JSON.stringify({
      event: 'ocr_document_failed',
      documentId,
      actorId: userData.user.id,
      message: error instanceof Error ? error.message : 'Unknown OCR error',
    }));
    return reply(request, 502, { configured: true, error: 'Document OCR failed. Please retry.' });
  }
});
