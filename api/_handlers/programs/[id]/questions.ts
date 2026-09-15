import { qualificationQuestionSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../../../_lib/rest.js';

/** GET /programs/:id/qualification-questions — public (API-SPECIFICATION #86). */
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
  const rawId = req.query.id;
  const programId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!programId) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Program id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: program, error: programError } = await supabase
    .from('Program')
    .select('id')
    .eq('id', programId)
    .maybeSingle();
  if (programError) {
    const { error, status } = toErrorEnvelope('INTERNAL', programError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!program) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', `Program not found: ${programId}`, 404);
    res.status(status).json({ error });
    return;
  }
  const { data, error } = await supabase
    .from('ProgramQuestion')
    .select('id, questionText')
    .eq('programId', programId)
    .order('id');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  // DB stores camelCase questionText; map defensively for legacy snake_case rows.
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    questionText: row.questionText ?? row.question_text,
  }));
  okList(res, rows.filter((row) => qualificationQuestionSchema.safeParse(row).success));
}
