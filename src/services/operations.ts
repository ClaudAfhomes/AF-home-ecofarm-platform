import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

export type Product = Database['public']['Tables']['products']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Sale = Database['public']['Tables']['sales']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function listTable<T>(table: 'products' | 'customers' | 'sales' | 'payments' | 'notifications' | 'audit_logs'): Promise<T[]> {
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

export async function createSignedDocumentUrl(bucket: 'customer-documents' | 'payment-receipts' | 'employee-documents', path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  fail(error);
  return data?.signedUrl;
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
