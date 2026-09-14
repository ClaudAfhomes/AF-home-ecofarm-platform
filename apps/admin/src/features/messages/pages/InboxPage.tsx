import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@jad/ui';

import { formatDate } from '../../../lib/format';
import { useAdminConversations } from '../hooks/useConversations';
import styles from './InboxPage.module.css';

function TableSkeleton() {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Member</TableHeaderCell>
          <TableHeaderCell>Last message</TableHeaderCell>
          <TableHeaderCell>Unread</TableHeaderCell>
          <TableHeaderCell>Last activity</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: 5 }, (_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Admin Messages inbox (SCR-ADM Messages, FEAT-072, ADR-013). One row per
 * member with a thread; click to open the conversation. */
export function InboxPage() {
  const { data, isPending, isError, error, refetch } = useAdminConversations();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const allItems = useMemo(() => [...(data ?? [])], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (c) =>
        c.memberName.toLowerCase().includes(q) || c.memberEmail.toLowerCase().includes(q),
    );
  }, [allItems, search]);

  const unreadTotal = allItems.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <section>
      <PageHeader
        title="Messages"
        description={`Member conversations with the admin team${unreadTotal > 0 ? ` · ${unreadTotal} unread` : ''}`}
      />

      <div className={styles.filters} role="search" aria-label="Search conversations">
        <label className={styles.searchWrap} aria-label="Search conversations">
          <input
            type="search"
            placeholder="Search by member"
            aria-label="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </label>
      </div>

      <p className={styles.count} aria-live="polite">
        {isPending
          ? 'Loading conversations…'
          : `Showing ${filtered.length} of ${allItems.length} ${allItems.length === 1 ? 'conversation' : 'conversations'}`}
      </p>

      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : allItems.length === 0 ? (
        <EmptyState
          title="No conversations"
          description="Member messages will appear here when members reach out."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="No conversations match your search."
          action={
            <button type="button" className={styles.inlineLink} onClick={() => setSearch('')}>
              Clear search
            </button>
          }
        />
      ) : (
        <div className="table-scroll">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Member</TableHeaderCell>
                <TableHeaderCell>Last message</TableHeaderCell>
                <TableHeaderCell>Unread</TableHeaderCell>
                <TableHeaderCell>Last activity</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((conversation) => (
                <TableRow key={conversation.memberId}>
                  <TableCell>
                    <button
                      type="button"
                      className={styles.memberButton}
                      onClick={() => navigate(`/admin/messages/${conversation.memberId}`)}
                      aria-label={`Open conversation with ${conversation.memberName}`}
                    >
                      <span className={styles.memberName}>{conversation.memberName}</span>
                      <span className={styles.memberEmail}>{conversation.memberEmail}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <span
                      className={styles.previewCell}
                      title={conversation.lastMessagePreview ?? undefined}
                    >
                      {conversation.lastMessagePreview ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {conversation.unreadCount > 0 ? (
                      <span className={styles.unreadBadge}>{conversation.unreadCount}</span>
                    ) : (
                      <span className={styles.noUnread}>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {conversation.lastMessageAt ? formatDate(conversation.lastMessageAt) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}