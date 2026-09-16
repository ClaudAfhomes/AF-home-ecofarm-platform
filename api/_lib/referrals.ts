/**
 * Referral tree helpers (Phase B7): pure adjacency builders over
 * `{ id, sponsorId }` rows. Cycle-guarded — a corrupt link terminates the
 * branch instead of recursing forever.
 */

export type SponsorRow = {
  id: string;
  sponsorId?: string | null;
};

export function childrenOf<T extends SponsorRow>(rows: T[], sponsorId: string): T[] {
  return rows.filter((row) => row.sponsorId === sponsorId).sort((a, b) => a.id.localeCompare(b.id));
}

/** All descendants of a member (any depth), excluding the member itself. */
export function descendantsOf<T extends SponsorRow>(rows: T[], rootId: string): T[] {
  const out: T[] = [];
  const visited = new Set<string>([rootId]);
  const queue = [...childrenOf(rows, rootId)];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (visited.has(next.id)) continue;
    visited.add(next.id);
    out.push(next);
    queue.push(...childrenOf(rows, next.id));
  }
  return out;
}

/**
 * Upline chain of a member — from the topmost reachable ancestor down to the
 * direct sponsor, excluding the member itself. Cycle-guarded and depth-capped
 * (a corrupt sponsor link terminates the chain instead of looping).
 */
export function ancestorChainOf<T extends SponsorRow>(
  rows: T[],
  memberId: string,
  maxDepth = 10,
): T[] {
  const chain: T[] = [];
  const visited = new Set<string>([memberId]);
  let current = rows.find((row) => row.id === memberId);
  let depth = 0;
  while (current && depth < maxDepth) {
    const sponsorId = current.sponsorId;
    if (!sponsorId || visited.has(sponsorId)) break;
    visited.add(sponsorId);
    const parent = rows.find((row) => row.id === sponsorId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
    depth += 1;
  }
  return chain;
}

export type GenealogyNodeInput = SponsorRow & {
  name: string;
  status: string;
  isQualified: boolean;
  joinedAt: string;
};

export type GenealogyNode = {
  id: string;
  name: string;
  status: string;
  isQualified: boolean;
  joinedAt: string;
  children: GenealogyNode[];
};

/** Recursive genealogy tree rooted at the given member. */
export function genealogyTree(
  rows: GenealogyNodeInput[],
  rootId: string,
  visited = new Set<string>(),
): GenealogyNode | null {
  const root = rows.find((row) => row.id === rootId);
  if (!root || visited.has(rootId)) return null;
  const seen = new Set(visited);
  seen.add(rootId);
  return {
    id: root.id,
    name: root.name,
    status: root.status,
    isQualified: root.isQualified,
    joinedAt: root.joinedAt,
    children: childrenOf(rows, rootId)
      .map((child) => genealogyTree(rows, child.id, seen))
      .filter((node): node is GenealogyNode => node !== null),
  };
}
