import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import { locationVerificationRequestSchema } from '@jad/contracts';

import { getSupabaseEnv } from '../../_lib/env.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const raw = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === 'string') return raw;
  return undefined;
}

// --- SINGLE isolated mapping function ---
// PH → DOMESTIC, non-PH → ABROAD. No PH default on unknown.
function mapCountryToProgram(countryCode: string): { programId: string; programCode: 'DOMESTIC' | 'ABROAD' } {
  const cc = countryCode.toUpperCase();
  if (cc === 'PH') return { programId: 'prg-domestic', programCode: 'DOMESTIC' };
  return { programId: 'prg-abroad', programCode: 'ABROAD' };
}

// --- Nominatim reverse geocoding (server-side only, no VITE_ exposure) ---
// Resolves GPS lat/lon → ISO 3166-1 alpha-2 via OpenStreetMap Nominatim.
// Requires User-Agent per usage policy. No hard-coded bounding boxes.
function getNominatimConfig() {
  const url = process.env.REVERSE_GEO_PROVIDER_URL ?? 'https://nominatim.openstreetmap.org/reverse';
  const timeoutMs = Number(process.env.REVERSE_GEO_TIMEOUT_MS ?? 4000);
  // Nominatim usage policy requires a valid User-Agent identifying the application
  const userAgent = process.env.REVERSE_GEO_USER_AGENT ?? 'jad-realty/1.0 (contact: support@jad.local)';
  const referer = process.env.REVERSE_GEO_REFERER ?? 'https://jad-realty.vercel.app';
  return { url, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 4000, userAgent, referer };
}

async function reverseGeocodeCountry(latitude: number, longitude: number): Promise<string> {
  const { url, timeoutMs, userAgent, referer } = getNominatimConfig();
  // Do not expose provider config via error to client beyond code; details logged server-side
  const params = new URLSearchParams({
    format: 'json',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '3',
    addressdetails: '1',
  });
  const fetchUrl = `${url}?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': userAgent,
        Referer: referer,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const msg = (e as Error).name === 'TimeoutError' ? 'Reverse-geolocation timeout' : (e as Error).message;
    throw Object.assign(new Error(msg), { code: 'GEO_REVERSE_FAILED', cause: e });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Nominatim error ${res.status}`), { code: 'GEO_REVERSE_FAILED', status: res.status });
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw Object.assign(new Error('Invalid Nominatim JSON'), { code: 'GEO_REVERSE_FAILED' });
  }
  const countryCode = (data as { address?: { country_code?: string } })?.address?.country_code;
  if (typeof countryCode !== 'string' || !/^[a-z]{2}$/i.test(countryCode)) {
    throw Object.assign(new Error('Nominatim missing country_code'), { code: 'GEO_REVERSE_FAILED', data });
  }
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) {
    throw Object.assign(new Error('Invalid country code from provider'), { code: 'GEO_REVERSE_FAILED', cc });
  }
  return cc;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ? String(req.headers.origin) : '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    const { error, status } = toErrorEnvelope('NOT_FOUND', `Method ${req.method} not allowed`, 405);
    res.status(status).json({ error });
    return;
  }

  // Parse body
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid JSON body', 400);
      res.status(status).json({ error });
      return;
    }
  }
  if (body === undefined || body === null) body = {};

  // Validate via contract (union GPS | {ipFallback:true} | {})
  const parsed = locationVerificationRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Zod will emit min/max violations for lat/lon → surface as 400 invalid_coordinates
    const first = parsed.error.issues[0];
    const isCoordBound = first?.path.includes('latitude') || first?.path.includes('longitude');
    const code = isCoordBound ? 'VALIDATION_ERROR' : 'VALIDATION_ERROR';
    const { error, status } = toErrorEnvelope(code, first?.message ?? 'Invalid location verification payload', 400, parsed.error.issues);
    res.status(status).json({ error });
    return;
  }

  const payload = parsed.data as
    | { latitude: number; longitude: number; accuracy?: number; timestamp?: string }
    | { ipFallback: true }
    | Record<string, never>;

  // Resolve country + method
  let verifiedCountryCode: string | null = null;
  let detectedCountryCode: string | undefined;
  let method: 'GPS' | 'IP' | null = null;
  let accuracy: number | undefined;
  let latitude: number | undefined;
  let longitude: number | undefined;
  let ipCountryHeader: string | undefined;

  const hasGps = typeof (payload as Record<string, unknown>).latitude === 'number' && typeof (payload as Record<string, unknown>).longitude === 'number';
  if (hasGps) {
    const g = payload as { latitude: number; longitude: number; accuracy?: number };
    if (g.latitude < -90 || g.latitude > 90 || g.longitude < -180 || g.longitude > 180) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid coordinates', 400);
      res.status(status).json({ error });
      return;
    }
    latitude = g.latitude;
    longitude = g.longitude;
    accuracy = g.accuracy;
    method = 'GPS';
    try {
      const cc = await reverseGeocodeCountry(latitude, longitude);
      verifiedCountryCode = cc;
      detectedCountryCode = cc;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const code = err?.code === 'GEO_REVERSE_FAILED' ? 'GEO_REVERSE_FAILED' : 'GEO_REVERSE_FAILED';
      // Distinguish provider not configured vs transient failure (both controlled, never PH/US default)
      const providerUrl = getNominatimConfig().url;
      const isNotConfigured = !providerUrl || providerUrl.trim().length === 0;
      const finalCode = isNotConfigured ? 'GEO_PROVIDER_NOT_CONFIGURED' : code;
      const message =
        finalCode === 'GEO_PROVIDER_NOT_CONFIGURED'
          ? 'Reverse-geolocation provider not configured. Set REVERSE_GEO_PROVIDER_URL / REVERSE_GEO_USER_AGENT in server env.'
          : 'Location could not be resolved to a country. Please retry. (provider error)';
      console.error('[location-verify] reverseGeocode failed:', err?.message ?? e, 'lat', latitude, 'lon', longitude);
      const { error, status } = toErrorEnvelope(finalCode, message, 422, {
        reason: 'REVERSE_GEOCODE_FAILED',
      });
      res.status(status).json({ error });
      return;
    }
  } else {
    // IP fallback: use ONLY existing Vercel header. Do not invent provider.
    // Canonical: x-vercel-ip-country (2-letter). Also check x-vercel-ip-country-region style? Use only country.
    ipCountryHeader =
      headerValue(req.headers, 'x-vercel-ip-country') ??
      headerValue(req.headers, 'x-vercel-ip-country-code') ??
      undefined;
    // Normalize
    const raw = ipCountryHeader?.trim().toUpperCase();
    if (raw && /^[A-Z]{2}$/.test(raw)) {
      verifiedCountryCode = raw;
      detectedCountryCode = raw;
      method = 'IP';
    } else {
      // No reliable IP country available → controlled error, never PH default
      const { error, status } = toErrorEnvelope(
        'GEO_UNAVAILABLE',
        'Location could not be determined. Please enable location access or ensure your network provides a country header (x-vercel-ip-country) and retry. No external IP provider is configured.',
        422,
        { reason: 'NO_LOCATION', hint: 'Retry with GPS allowed, or deploy behind Vercel to expose x-vercel-ip-country.' },
      );
      res.status(status).json({ error });
      return;
    }
  }

  // At this point verifiedCountryCode is non-null and method is set
  const cc = verifiedCountryCode!.toUpperCase();

  // Validate against countries master data (ISO 3166-1). Do NOT default unknown to US/PH.
  // If provider returns unknown/invalid code → 422 GEO_REVERSE_FAILED
  const { url: supaUrl, serviceKey: supaServiceKey } = getSupabaseEnv();
  let supabaseForValidation: ReturnType<typeof createClient> | null = null;
  if (supaUrl && supaServiceKey) {
    try {
      supabaseForValidation = createClient(supaUrl, supaServiceKey, { auth: { autoRefreshToken: false } });
    } catch {}
  }
  if (supabaseForValidation) {
    try {
      const { data: countryRow, error: countryErr } = await supabaseForValidation
        .from('countries')
        .select('code, name, is_active')
        .eq('code', cc)
        .maybeSingle();
      if (countryErr) {
        // If table missing (migration not applied), log and allow — dev fallback. Production must have migration.
        console.warn('[location-verify] countries lookup failed (migration may not be applied):', countryErr.message);
      } else if (!countryRow || (countryRow as { is_active: boolean }).is_active === false) {
        console.error('[location-verify] unknown/inactive country code from provider:', cc);
        const { error, status } = toErrorEnvelope('GEO_REVERSE_FAILED', 'Location could not be resolved to a supported country.', 422, {
          reason: 'UNKNOWN_COUNTRY',
          code: cc,
        });
        res.status(status).json({ error });
        return;
      }
    } catch (e) {
      console.warn('[location-verify] countries validation error:', (e as Error).message);
    }
  } else {
    console.warn('[location-verify] SUPABASE not configured; skipping countries master validation (dev mock fallback).');
  }

  const { programId, programCode } = mapCountryToProgram(cc);
  const isPhilippines = cc === 'PH';
  const verificationId = randomUUID();

  // Attempt to persist (optional; do not block response on DB failure beyond logging)
  const { url, serviceKey } = getSupabaseEnv();
  if (url && serviceKey) {
    try {
      const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
      const { error } = await supabase.from('location_verifications').insert({
        verification_id: verificationId,
        verified_country_code: cc,
        detected_country_code: detectedCountryCode,
        program_id: programId,
        program_code: programCode,
        method,
        is_philippines: isPhilippines,
        blocked: false,
        requires_exception: false,
        accuracy: accuracy ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        ip_country_header: ipCountryHeader ?? null,
      });
      if (error) {
        // Non-fatal for MVP: log and continue (table may not exist until migration applied)
        console.error('[location-verify] insert failed:', error.message);
      }
    } catch (e) {
      console.error('[location-verify] insert error:', (e as Error).message);
    }
  } else {
    console.warn('[location-verify] SUPABASE not configured; verification not persisted (ok for local mock).');
  }

  res.status(200).json({
    verificationId,
    verifiedCountryCode: cc,
    detectedCountryCode,
    programId,
    programCode,
    method,
    isPhilippines,
    blocked: false,
    requiresException: false,
    accuracy,
  });
}
