import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';

const DEFAULT_GENDERS = ['Male', 'Female', 'Others'];

/** GET /config/public — non-sensitive parameters only (API-SPECIFICATION #81). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: rows, error } = await supabase.from('SystemConfig').select('key, value');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const byKey = new Map(
    ((rows as { key: string; value: string }[] | null) ?? []).map((r) => [r.key, r.value]),
  );
  const minimumAge = Number.parseInt(byKey.get('QUALIFICATION_MIN_AGE') ?? '18', 10);
  const moneyOk = (v: string | undefined): v is string =>
    typeof v === 'string' && /^[0-9]+(\.[0-9]{1,2})?$/.test(v);
  const minWithdrawal = byKey.get('MIN_WITHDRAWAL_AMOUNT');
  const maxWithdrawal = byKey.get('MAX_WITHDRAWAL_AMOUNT');
  let genders: string[] = DEFAULT_GENDERS;
  try {
    const parsed: unknown = JSON.parse(byKey.get('GENDERS') ?? '[]');
    if (Array.isArray(parsed) && parsed.every((g) => typeof g === 'string') && parsed.length > 0) {
      genders = parsed as string[];
    }
  } catch {
    // fall through to defaults
  }
  const { data: countries, error: countriesError } = await supabase
    .from('countries')
    .select('code, name')
    .eq('is_active', true)
    .order('code');
  if (countriesError) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', countriesError.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json({
    minimumAge: Number.isFinite(minimumAge) ? minimumAge : 18,
    genders,
    countries: countries ?? [],
    withdrawalLimits: {
      min: moneyOk(minWithdrawal) ? minWithdrawal : '100.00',
      max: moneyOk(maxWithdrawal) ? maxWithdrawal : '50000.00',
    },
  });
}
