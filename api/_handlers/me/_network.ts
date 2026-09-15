import type { requireService } from '../../_lib/rest.js';

export type MemberRow = {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
  isQualified?: boolean | null;
  sponsorId?: string | null;
  createdAt?: string | null;
};

type Service = NonNullable<ReturnType<typeof requireService>>;

/**
 * Shared referral-graph loader (Phase B7). The graph is tiny (sponsor links
 * only); one scan serves children, descendants, and tree building.
 */
export async function loadNetwork(supabase: Service): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('Member')
    .select('id,name,firstName,lastName,status,isQualified,sponsorId,createdAt');
  if (error) return [];
  return ((data as MemberRow[] | null) ?? []).filter((row) => typeof row.id === 'string');
}

export function displayName(row: MemberRow): string {
  const full = [row.firstName, row.lastName]
    .filter((part) => typeof part === 'string' && part)
    .join(' ');
  if (full) return full;
  return typeof row.name === 'string' && row.name ? row.name : row.id;
}

export function joinedAt(row: MemberRow): string {
  return typeof row.createdAt === 'string' ? row.createdAt : new Date(0).toISOString();
}
