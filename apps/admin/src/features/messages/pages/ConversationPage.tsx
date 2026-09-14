import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';

import { Breadcrumbs, Button, EmptyState, ErrorState, Skeleton, useToast } from '@jad/ui';
import type { Message } from '@jad/contracts';

import { ApiError } from '../../../lib/api/errors';
import { formatDate } from '../../../lib/format';
import { useSession } from '../../../lib/session';
import {
  useConversationThread,
  useMarkConversationRead,
  useSendStaffMessage,
} from '../hooks/useConversations';
import styles from './ConversationPage.module.css';

/**
 * Admin conversation detail (SCR-ADM Messages, FEAT-072, ADR-013). A single
 * member's thread rendered oldest→newest with the staff composer. Opening
 * the thread marks it read (staff watermark).
 */
export function ConversationPage() {
  const { memberId = '' } = useParams<{ memberId: string }>();
  const { user } = useSession();
  const { toast } = useToast();
  const threadQuery = useConversationThread(memberId);
  const sendMutation = useSendStaffMessage(memberId);
  const markReadMutation = useMarkConversationRead(memberId);
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement | null>(null);
  const markedRef = useRef(false);

  const messages: Message[] = (threadQuery.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse();

  // Mark the thread read on first successful load (idempotent server-side).
  useEffect(() => {
    if (markedRef.current) return;
    if (!threadQuery.isSuccess || threadQuery.data.pages.length === 0) return;
    markedRef.current = true;
    markReadMutation.mutate(undefined);
  }, [threadQuery.isSuccess, threadQuery.data, markReadMutation]);

  const scrollToBottom = () => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const canSend = draft.trim().length > 0 && draft.length <= 4000;

  const submit = () => {
    if (!canSend || sendMutation.isPending) return;
    sendMutation.mutate(draft, {
      onSuccess: () => {
        setDraft('');
        requestAnimationFrame(scrollToBottom);
      },
      onError: (error) => {
        toast({
          title: 'Could not send reply',
          message:
            error instanceof ApiError ? error.message : 'We could not send your message.',
          tone: 'danger',
        });
      },
    });
  };

  const memberName = messages[0]?.senderName && messages.some((m) => m.senderType === 'MEMBER')
    ? messages.find((m) => m.senderType === 'MEMBER')?.senderName
    : 'Member';

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Messages', to: '/admin/messages' },
          { label: memberName ?? 'Conversation' },
        ]}
      />

      <div className={styles.threadShell}>
        {threadQuery.isLoading ? (
          <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        ) : threadQuery.isError ? (
          <ErrorState
            error={threadQuery.error}
            title="Could not load this conversation"
            onRetry={() => void threadQuery.refetch()}
          />
        ) : (
          <div className={styles.thread} ref={threadRef} aria-live="polite">
            {threadQuery.hasNextPage ? (
              <div className={styles.loadOlder}>
                <Button
                  variant="ghost"
                  onClick={() => void threadQuery.fetchNextPage()}
                  disabled={threadQuery.isFetchingNextPage}
                >
                  {threadQuery.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                </Button>
              </div>
            ) : null}
            {messages.length === 0 ? (
              <div className={styles.empty}>
                <EmptyState
                  title="No messages yet"
                  description="Send the first message to start this conversation."
                />
              </div>
            ) : (
              <ul className={styles.list}>
                {messages.map((message) => {
                  const staff = message.senderType === 'STAFF';
                  return (
                    <li
                      key={message.id}
                      className={`${styles.row} ${staff ? styles.rowStaff : styles.rowMember}`}
                    >
                      <div
                        className={`${styles.bubble} ${staff ? styles.bubbleStaff : styles.bubbleMember}`}
                      >
                        <p className={styles.sender}>{message.senderName}</p>
                        <p className={styles.body}>{message.body}</p>
                        <span className={styles.meta}>{formatDate(message.createdAt)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className={styles.composer}>
        <label className={styles.composerLabel} htmlFor="staff-message-draft">
          Reply as {user?.name ?? 'you'}
        </label>
        <textarea
          id="staff-message-draft"
          className={styles.composerInput}
          value={draft}
          maxLength={4000}
          rows={3}
          placeholder="Write a reply…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className={styles.composerFooter}>
          <span className={styles.counter}>{draft.length}/4000</span>
          <Button onClick={submit} disabled={!canSend || sendMutation.isPending}>
            {sendMutation.isPending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </div>

      <p className={styles.backLink}>
        <Link to="/admin/messages">← Back to inbox</Link>
      </p>
    </section>
  );
}