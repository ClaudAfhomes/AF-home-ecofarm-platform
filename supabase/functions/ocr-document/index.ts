import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const headers = { 'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Content-Type': 'application/json' };
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  const providerUrl = Deno.env.get('OCR_PROVIDER_URL'); const providerKey = Deno.env.get('OCR_PROVIDER_API_KEY');
  if (!providerUrl || !providerKey) return new Response(JSON.stringify({ configured: false, error: 'OCR not configured' }), { status: 503, headers });
  const url = Deno.env.get('SUPABASE_URL')!; const key = Deno.env.get('SUPABASE_ANON_KEY')!;
  const client = createClient(url, key, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const { data: claims } = await client.auth.getClaims();
  if (!claims?.claims?.sub) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  const { documentId } = await request.json();
  const { data: document, error } = await client.from('customer_documents').select('storage_path').eq('id', documentId).single();
  if (error || !document) return new Response(JSON.stringify({ error: 'Document unavailable' }), { status: 404, headers });
  const { data: signed } = await client.storage.from('customer-documents').createSignedUrl(document.storage_path, 60);
  const response = await fetch(providerUrl, { method: 'POST', headers: { Authorization: `Bearer ${providerKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ documentUrl: signed?.signedUrl }) });
  if (!response.ok) return new Response(JSON.stringify({ error: 'OCR provider failed' }), { status: 502, headers });
  const extraction = await response.json();
  await client.from('customer_documents').update({ ocr_status: 'extracted', ocr_result: extraction }).eq('id', documentId);
  return new Response(JSON.stringify({ configured: true, extraction, requiresReview: true }), { headers });
});
