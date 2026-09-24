import { supabase } from '../lib/supabase';
import type { Database, EmploymentStatus, RoleSlug } from '../lib/database.types';

export type Product = Database['public']['Tables']['products']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Sale = Database['public']['Tables']['sales']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type Role = Database['public']['Tables']['roles']['Row'];
export type Department = Database['public']['Tables']['departments']['Row'];
export type StaffProfile = Database['public']['Tables']['profiles']['Row'] & {
  roles: { name: string; slug: RoleSlug };
  departments: { name: string } | null;
  staff_invitations: { status: string; invited_at: string; last_sent_at: string; accepted_at: string | null }[];
  genealogy_parent: { full_name: string } | null;
};
export type StaffInput = {
  email: string; fullName: string; roleId: string; departmentId: string | null;
  phone: string | null; employeeNo: string | null; parentId: string | null;
  isTestAccount?: boolean; deliveryMode?: 'email' | 'link';
};

export type AnalyticsGrouping = 'day' | 'week' | 'month' | 'year';
export type AnalyticsProductType = 'All' | 'Bronze' | 'Silver' | 'Gold';
export type AnalyticsFilters = {
  from: string;
  to: string;
  grouping: AnalyticsGrouping;
  productType: AnalyticsProductType;
  salespersonId?: string | null;
  viceDirectorId?: string | null;
};

export type SalesAnalytics = {
  filters: {
    from: string;
    to: string;
    grouping: AnalyticsGrouping;
    productType: AnalyticsProductType;
    salespersonId: string | null;
    viceDirectorId: string | null;
  };
  summary: {
    totalSalesCreated: number;
    totalVerifiedSales: number;
    downPaymentCollection: string;
    totalCollection: string;
    averageSalesPerPeriod: string;
    highestPeriod: { bucket: string | null; verifiedSales: number; amount: string };
    lowestPeriod: { bucket: string | null; verifiedSales: number; amount: string };
    pendingPayments: number;
    pendingAmount: string;
  };
  buckets: Array<{
    bucket: string;
    salesCreated: number;
    verifiedSales: number;
    collectedAmount: string;
    totalCollectedAmount: string;
    pendingPayments: number;
    pendingAmount: string;
  }>;
};

export type ViceDirectorAnalytics = SalesAnalytics & {
  summary: SalesAnalytics['summary'] & {
    totalMembers: number;
    activeMembers: number;
    inactiveMembers: number;
    newMembers: number;
    membersWithSalesActivity: number;
    membersWithNoSalesActivity: number;
    pendingPaymentCount: number;
    pendingPaymentAmount: string;
    overduePaymentCount: number;
    overduePaymentAmount: string;
  };
  members: Array<{
    memberId: string;
    memberName: string;
    role: string;
    roleSlug: RoleSlug;
    accountStatus: EmploymentStatus;
    isActive: boolean;
    directReferrals: number;
    verifiedSaleCount: number;
    totalVerifiedCollection: string;
    lastSaleDate: string | null;
    performanceLabel: string;
    newMember: boolean;
  }>;
};

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function listTable<T>(table: 'products' | 'customers' | 'sales' | 'payments' | 'notifications' | 'audit_logs' | 'qr_credits' | 'qr_scan_events'): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(250);
  fail(error);
  return (data ?? []) as T[];
}

export async function createCustomer(input: Database['public']['Tables']['customers']['Insert'], idFile?: File) {
  const { data, error } = await supabase.from('customers').insert(input).select('*').single();
  fail(error);
  if (idFile && data) {
    const bytes = await idFile.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const path = `${data.id}/${crypto.randomUUID()}-${idFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const upload = await supabase.storage.from('customer-documents').upload(path, idFile, { contentType: idFile.type, upsert: false });
    fail(upload.error);
    const documentWrite = await supabase.from('customer_documents').insert({ customer_id: data.id, kind: 'government_id', storage_path: path, sha256: hash, mime_type: idFile.type, size_bytes: idFile.size });
    fail(documentWrite.error);
  }
  return data;
}

export async function createSale(input: Database['public']['Tables']['sales']['Insert']) {
  const { data, error } = await supabase.from('sales').insert(input).select('*').single();
  fail(error);
  return data;
}

export async function submitPayment(input: Database['public']['Tables']['payments']['Insert'], receipt?: File) {
  let payload = input;
  if (receipt) {
    const bytes = await receipt.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const path = `${input.sale_id}/${crypto.randomUUID()}-${receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const upload = await supabase.storage.from('payment-receipts').upload(path, receipt, { contentType: receipt.type });
    fail(upload.error);
    payload = { ...input, receipt_path: path, receipt_sha256: hash };
  }
  const { data, error } = await supabase.from('payments').insert(payload).select('*').single();
  fail(error);
  return data;
}

export async function verifyPayment(paymentId: string, approved: boolean, notes: string) {
  const { error } = await supabase.rpc('verify_payment', { p_payment_id: paymentId, p_approved: approved, p_notes: notes || null });
  fail(error);
}

export async function scanQrCode(token: string, referredMemberId?: string | null) {
  const { data, error } = await supabase.rpc('scan_qr_code', {
    p_token: token,
    p_referred_member_id: referredMemberId ?? null,
  });
  fail(error);
  return data as {
    status: 'success' | 'invalid' | 'expired' | 'revoked' | 'duplicate' | 'unauthorized' | 'error';
    message: string;
    creditId?: string;
    memberId?: string;
    creditNumber?: number;
  };
}

export async function fetchSalesAnalytics(filters: AnalyticsFilters) {
  const { data, error } = await supabase.rpc('sales_analytics', {
    p_from: filters.from,
    p_to: filters.to,
    p_grouping: filters.grouping,
    p_product_type: filters.productType,
    p_salesperson_id: filters.salespersonId ?? null,
    p_vice_director_id: filters.viceDirectorId ?? null,
  });
  fail(error);
  return data as unknown as SalesAnalytics;
}

export async function fetchViceDirectorAnalytics(filters: AnalyticsFilters) {
  const { data, error } = await supabase.rpc('vice_director_analytics', {
    p_from: filters.from,
    p_to: filters.to,
    p_grouping: filters.grouping,
    p_product_type: filters.productType,
    p_vice_director_id: filters.viceDirectorId ?? null,
  });
  fail(error);
  return data as unknown as ViceDirectorAnalytics;
}

export async function createSignedDocumentUrl(bucket: 'customer-documents' | 'payment-receipts' | 'employee-documents', path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  fail(error);
  return data?.signedUrl;
}

export async function listRoles() {
  const { data, error } = await supabase.from('roles').select('*').eq('is_system', true).order('name');
  fail(error);
  return (data ?? []) as Role[];
}

export async function listDepartments(includeInactive = true) {
  let query = supabase.from('departments').select('*').order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  fail(error);
  return (data ?? []) as Department[];
}

export async function listStaff(options: { page: number; pageSize: number; search: string; role: string; status: string; department: string; testOnly?: boolean }) {
  const from = options.page * options.pageSize;
  // Avoid relationship embeds for departments and profile parents here. The live
  // schema has reverse department leadership and two profile self-relations, which
  // makes these PostgREST embeds ambiguous/stale-cache-sensitive. Explicit ID
  // lookups preserve the same RLS checks and keep this list query deterministic.
  let query = supabase.from('profiles').select('*,roles!inner(name,slug),staff_invitations(status,invited_at,last_sent_at,accepted_at)', { count: 'exact' });
  if (options.search) query = query.or(`full_name.ilike.%${options.search}%,email.ilike.%${options.search}%,employee_no.ilike.%${options.search}%`);
  if (options.role) query = query.eq('roles.slug', options.role as RoleSlug);
  if (options.status) query = query.eq('employment_status', options.status as EmploymentStatus);
  if (options.department) query = query.eq('department_id', options.department);
  if (options.testOnly) query = query.eq('is_test_account', true);
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + options.pageSize - 1);
  fail(error);
  const profiles = data ?? [];
  const departmentIds = [...new Set(profiles.flatMap((profile) => profile.department_id ? [profile.department_id] : []))];
  const parentIds = [...new Set(profiles.flatMap((profile) => profile.genealogy_parent_id ? [profile.genealogy_parent_id] : []))];
  const [departmentResult, parentResult] = await Promise.all([
    departmentIds.length
      ? supabase.from('departments').select('id,name').in('id', departmentIds)
      : Promise.resolve({ data: [], error: null }),
    parentIds.length
      ? supabase.from('profiles').select('id,full_name').in('id', parentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  fail(departmentResult.error);
  fail(parentResult.error);
  const departmentNames = new Map((departmentResult.data ?? []).map((department) => [department.id, department.name]));
  const parentNames = new Map((parentResult.data ?? []).map((parent) => [parent.id, parent.full_name]));
  const rows = profiles.map((profile) => ({
    ...profile,
    departments: profile.department_id ? { name: departmentNames.get(profile.department_id) ?? 'Unknown department' } : null,
    genealogy_parent: profile.genealogy_parent_id ? { full_name: parentNames.get(profile.genealogy_parent_id) ?? 'Unknown member' } : null,
  })) as unknown as StaffProfile[];
  return { rows, count: count ?? 0 };
}

async function invokeAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.clone === 'function') {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Preserve the SDK error if the function did not return JSON.
      }
    }
    throw new Error(message);
  }
  if (!data || typeof data.id !== 'string') throw new Error('The staff request returned an invalid response.');
  return data as { id: string; actionLink?: string };
}

export const inviteStaff = (input: StaffInput) => invokeAdminUsers({ action: 'invite', ...input });
export const resendStaffInvitation = (userId: string) => invokeAdminUsers({ action: 'resend', userId });
export const updateStaff = (userId: string, input: Omit<StaffInput, 'email'> & { employmentStatus: EmploymentStatus; reason: string }) =>
  invokeAdminUsers({ action: 'update', userId, ...input });

export async function createDepartment(name: string, description: string, accountableLeaderId: string | null) {
  const { data, error } = await supabase.rpc('admin_create_department', { p_name: name, p_description: description || null, p_accountable_leader_id: accountableLeaderId });
  fail(error); return data;
}

export async function updateDepartment(department: Department) {
  const { data, error } = await supabase.rpc('admin_update_department', { p_department_id: department.id, p_name: department.name, p_description: department.description, p_is_active: department.is_active, p_accountable_leader_id: department.accountable_leader_id });
  fail(error); return data;
}

export async function listDepartmentCounts() {
  const { data, error } = await supabase.from('profiles').select('department_id');
  fail(error);
  return (data ?? []).reduce<Record<string, number>>((counts, row) => {
    if (row.department_id) counts[row.department_id] = (counts[row.department_id] ?? 0) + 1;
    return counts;
  }, {});
}

export function exportRows(rows: Record<string, unknown>[], filename: string, format: 'csv' | 'xlsx') {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.map(escapeCsv).join(','), ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(','))].join('\r\n');
  if (format === 'csv') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${filename}.csv`; anchor.click(); URL.revokeObjectURL(url);
  } else {
    const xmlEscape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const rowXml = (values: unknown[]) => `<Row>${values.map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`).join('')}</Row>`;
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${rowXml(headers)}${rows.map((row) => rowXml(headers.map((key) => row[key]))).join('')}</Table></Worksheet></Workbook>`;
    const blob = new Blob([workbook], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${filename}.xls`; anchor.click(); URL.revokeObjectURL(url);
  }
}
