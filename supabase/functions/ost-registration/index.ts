import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const headers = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(req.headers.get('origin') ?? '') ? req.headers.get('origin')! : allowedOrigins[0] ?? '',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', Vary: 'Origin',
});
const reply = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: headers(req) });
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase())));
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (v) => v.toString(36).padStart(2, '0')).join('').slice(0, 24).toUpperCase();
const validFile = (file: File) => ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) && file.size > 0 && file.size <= 5_242_880;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headers(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Method not allowed' });
  const url = Deno.env.get('SUPABASE_URL'); const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !secret || !anon) return reply(req, 503, { error: 'Server configuration incomplete' });
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const ipHash = await hash(req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown');
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from('ost_submission_attempts').select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
    if ((count ?? 0) >= 5) return reply(req, 429, { error: 'Too many submissions. Try again later.' });
    await admin.from('ost_submission_attempts').insert({ ip_hash: ipHash });
    const form = await req.formData();
    const get = (key: string) => String(form.get(key) ?? '').trim();
    const codeHash = await hash(get('referralCode'));
    const { data: code } = await admin.from('ost_referral_codes').select('*').eq('code_hash', codeHash).eq('status', 'active').gt('expires_at', new Date().toISOString()).maybeSingle();
    if (!code || code.use_count >= code.max_uses) return reply(req, 400, { error: 'Referral code is invalid, expired, inactive, or fully used.' });
    if (get('consent') !== 'true' || get('certification') !== 'true') return reply(req, 400, { error: 'Consent and accuracy certification are required.' });
    const front = form.get('idFront'); const back = form.get('idBack');
    if (!(front instanceof File) || !validFile(front) || (back instanceof File && back.size > 0 && !validFile(back))) return reply(req, 400, { error: 'ID files must be JPG, PNG, or PDF and no larger than 5 MB.' });
    const email = get('email').toLowerCase(); const idNumber = get('idNumber');
    const emailHash = await hash(email); const idHash = await hash(idNumber);
    const { data: duplicate } = await admin.from('ost_registrations').select('id').or(`email_hash.eq.${emailHash},id_number_hash.eq.${idHash}`).limit(1).maybeSingle();
    if (duplicate) return reply(req, 409, { error: 'An application already exists for this email or ID.' });
    const payload = {
      referral_code_id: code.id, sales_manager_id: code.sales_manager_id, vice_director_id: code.vice_director_id,
      email, email_hash: emailHash, mobile: get('mobile'), first_name: get('firstName'), middle_name: get('middleName') || null,
      last_name: get('lastName'), date_of_birth: get('dateOfBirth'), sex: get('sex') || null, address_line: get('addressLine'),
      barangay: get('barangay'), city: get('city'), province: get('province'), postal_code: get('postalCode'), id_type: get('idType'),
      id_number_hash: idHash, id_number_last4: idNumber.slice(-4), id_issue_date: get('idIssueDate') || null,
      id_expiration_date: get('idExpirationDate') || null, consented_at: new Date().toISOString(), certified_at: new Date().toISOString(),
    };
    if (!email || !payload.mobile || !payload.first_name || !payload.last_name || !payload.date_of_birth || !payload.address_line || !payload.barangay || !payload.city || !payload.province || !payload.postal_code || !payload.id_type || idNumber.length < 4) return reply(req, 400, { error: 'Complete all required fields.' });
    const { data: application, error: insertError } = await admin.from('ost_registrations').insert(payload).select('id').single();
    if (insertError || !application) return reply(req, 400, { error: insertError?.message ?? 'Application could not be saved.' });
    const files = [['front', front], ['back', back]] as const; const uploaded: string[] = [];
    for (const [side, file] of files) {
      if (!(file instanceof File) || file.size === 0) continue;
      const bytes = await file.arrayBuffer(); const fileHash = hex(await crypto.subtle.digest('SHA-256', bytes));
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${application.id}/${side}-${crypto.randomUUID()}.${ext}`;
      const upload = await admin.storage.from('ost-registration-documents').upload(path, bytes, { contentType: file.type, upsert: false });
      if (upload.error) {
        if (uploaded.length) await admin.storage.from('ost-registration-documents').remove(uploaded);
        await admin.from('ost_registration_documents').delete().eq('registration_id', application.id);
        await admin.from('ost_registrations').delete().eq('id', application.id);
        return reply(req, 500, { error: 'Private document upload failed.' });
      }
      uploaded.push(path);
      const document = await admin.from('ost_registration_documents').insert({ registration_id: application.id, side, storage_path: path, sha256: fileHash, mime_type: file.type, size_bytes: file.size });
      if (document.error) {
        await admin.storage.from('ost-registration-documents').remove(uploaded);
        await admin.from('ost_registration_documents').delete().eq('registration_id', application.id);
        await admin.from('ost_registrations').delete().eq('id', application.id);
        return reply(req, 500, { error: 'Document record could not be secured.' });
      }
    }
    await admin.from('ost_referral_codes').update({ use_count: code.use_count + 1 }).eq('id', code.id).eq('use_count', code.use_count);
    return reply(req, 201, { id: application.id, status: 'pending_verification' });
  }

  let body: Record<string, unknown>; try { body = await req.json(); } catch { return reply(req, 400, { error: 'Invalid request' }); }
  if (body.action === 'validate-code') {
    const codeHash = await hash(String(body.code ?? ''));
    const { data } = await admin.from('ost_referral_codes').select('id,expires_at,max_uses,use_count,sales_manager_id,profiles!ost_referral_codes_sales_manager_id_fkey(full_name)').eq('code_hash', codeHash).eq('status', 'active').gt('expires_at', new Date().toISOString()).maybeSingle();
    if (!data || data.use_count >= data.max_uses) return reply(req, 404, { valid: false });
    return reply(req, 200, { valid: true, salesManager: (data.profiles as unknown as { full_name: string }).full_name, expiresAt: data.expires_at });
  }

  const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: claims } = await userClient.auth.getClaims(); const actorId = claims?.claims?.sub as string | undefined;
  if (!actorId) return reply(req, 401, { error: 'Unauthorized' });
  const { data: actor } = await admin.from('profiles').select('id,is_active,vice_director_id,roles!inner(slug)').eq('id', actorId).single();
  const role = (actor?.roles as unknown as { slug: string })?.slug;
  if (!actor?.is_active) return reply(req, 403, { error: 'Inactive account' });
  if (body.action === 'create-code') {
    if (role !== 'sales_manager') return reply(req, 403, { error: 'Only Sales Managers can create OST referral codes.' });
    const raw = `OST-${token()}`; const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(body.validDays) || 30, 1), 90) * 86400000).toISOString();
    const { data, error } = await admin.from('ost_referral_codes').insert({ code_hash: await hash(raw), code_hint: raw.slice(-6), sales_manager_id: actorId, vice_director_id: actor.vice_director_id, expires_at: expiresAt }).select('*').single();
    if (error) return reply(req, 400, { error: error.message });
    await admin.from('audit_logs').insert({ actor_id: actorId, action: 'OST_REFERRAL_CODE_CREATED', entity_type: 'ost_referral_codes', entity_id: data.id, new_values: { expires_at: expiresAt } });
    return reply(req, 201, { ...data, code: raw });
  }
  if (body.action === 'deactivate-code') {
    if (role !== 'sales_manager') return reply(req, 403, { error: 'Only Sales Managers can manage their referral codes.' });
    const codeId = String(body.codeId ?? '');
    const { data, error } = await admin.from('ost_referral_codes').update({ status: 'inactive', deactivated_at: new Date().toISOString() })
      .eq('id', codeId).eq('sales_manager_id', actorId).eq('status', 'active').eq('use_count', 0).select('id').maybeSingle();
    if (error || !data) return reply(req, 400, { error: 'Only an unused active code can be deactivated.' });
    await admin.from('audit_logs').insert({ actor_id: actorId, action: 'OST_REFERRAL_CODE_DEACTIVATED', entity_type: 'ost_referral_codes', entity_id: codeId });
    return reply(req, 200, { id: codeId, status: 'inactive' });
  }
  const registrationId = String(body.registrationId ?? '');
  const { data: app } = await admin.from('ost_registrations').select('*').eq('id', registrationId).single();
  const canReview = role === 'super_admin' || role === 'admin' || (role === 'sales_manager' && app?.sales_manager_id === actorId);
  if (!app || !canReview) return reply(req, 403, { error: 'Application is outside your review scope.' });
  if (body.action === 'document-url') {
    const { data: doc } = await admin.from('ost_registration_documents').select('storage_path').eq('id', String(body.documentId ?? '')).eq('registration_id', app.id).single();
    if (!doc) return reply(req, 404, { error: 'Document not found' });
    const { data, error } = await admin.storage.from('ost-registration-documents').createSignedUrl(doc.storage_path, 60);
    return error ? reply(req, 400, { error: error.message }) : reply(req, 200, { url: data.signedUrl });
  }
  if (body.action === 'approve') {
    const redirectTo = Deno.env.get('INVITE_REDIRECT_URL');
    const invited = await admin.auth.admin.inviteUserByEmail(app.email, { data: { display_name: `${app.first_name} ${app.last_name}` }, ...(redirectTo ? { redirectTo } : {}) });
    if (invited.error || !invited.data.user) return reply(req, 400, { error: invited.error?.message ?? 'Invitation failed' });
    const result = await admin.rpc('approve_ost_registration', { p_registration_id: app.id, p_auth_user_id: invited.data.user.id, p_reviewer_id: actorId });
    if (result.error) { await admin.auth.admin.deleteUser(invited.data.user.id); return reply(req, 400, { error: result.error.message }); }
    return reply(req, 200, { id: app.id, status: 'invited' });
  }
  if (body.action === 'review') {
    const status = String(body.status ?? ''); const reason = String(body.reason ?? '').trim();
    if (!['needs_correction', 'rejected', 'suspended'].includes(status) || reason.length < 8) return reply(req, 400, { error: 'A valid decision and meaningful reason are required.' });
    if (['needs_correction', 'rejected'].includes(status) && !['pending_verification', 'needs_correction'].includes(app.status)) return reply(req, 409, { error: 'This application can no longer receive that decision.' });
    if (status === 'suspended' && !['invited', 'active'].includes(app.status)) return reply(req, 409, { error: 'Only an invited or active OST account can be suspended.' });
    if (status === 'suspended' && app.auth_user_id) {
      const profileUpdate = await admin.from('profiles').update({ employment_status: 'suspended', is_active: false }).eq('id', app.auth_user_id);
      if (profileUpdate.error) return reply(req, 400, { error: 'The OST profile could not be suspended.' });
      const authUpdate = await admin.auth.admin.updateUserById(app.auth_user_id, { ban_duration: '876000h' });
      if (authUpdate.error) {
        await admin.from('profiles').update({ employment_status: 'active', is_active: true }).eq('id', app.auth_user_id);
        return reply(req, 400, { error: 'The OST login could not be suspended.' });
      }
    }
    const { error } = await admin.from('ost_registrations').update({ status, review_reason: reason, reviewed_by: actorId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', app.id);
    if (error) {
      if (status === 'suspended' && app.auth_user_id) {
        await admin.from('profiles').update({ employment_status: 'active', is_active: true }).eq('id', app.auth_user_id);
        await admin.auth.admin.updateUserById(app.auth_user_id, { ban_duration: 'none' });
      }
      return reply(req, 400, { error: error.message });
    }
    await admin.from('audit_logs').insert({ actor_id: actorId, action: `OST_REGISTRATION_${status.toUpperCase()}`, entity_type: 'ost_registrations', entity_id: app.id, new_values: { reason } });
    return reply(req, 200, { id: app.id, status });
  }
  return reply(req, 400, { error: 'Unknown action' });
});
