import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  Breadcrumbs,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@jad/ui';
import type { Message } from '@jad/contracts';

import { Alert } from '@/components/Alert';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { useSession } from '../../../lib/session';
import {
  useMarkMessagesRead,
  useMessagesPage,
  useMessagesSummary,
  useSendMessage,
} from '../hooks/useMember';
import { formatDate } from '../lib/presentation';
import styles from './MessagesPage.module.css';

/**
 * Messages (SCR-MEM Messages, FEAT-072, ADR-013). One thread with the JA&D
 * admin team, newest-first via the API but rendered oldest→newest (standard
 * chat). Live staff replies arrive via `useMessagesRealtime`; opening the
 * thread marks it read (member watermark). Sends are optimistic-free: the
 * mutation posts, then the thread + summary queries invalidate.
 */
export function MessagesPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const threadQuery = useMessagesPage();
  const summaryQuery = useMessagesSummary();
  const sendMutation = useSendMessage();
  const markReadMutation = useMarkMessagesRead();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | undefined>();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const markedRef = useRef(false);

  const summaryKey = ['member', 'messages', 'summary', user?.id];

  // Mark the thread read on first successful load when there are unread
  // staff replies (idempotent server-side; ref-guard prevents repeats).
  useEffect(() => {
    if (markedRef.current) return;
    if (!threadQuery.isSuccess || threadQuery.data.pages.length === 0) return;
    if (summaryQuery.data && summaryQuery.data.unreadCount > 0) {
      markedRef.current = true;
      markReadMutation.mutate(undefined, {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: summaryKey });
        },
      });
    }
  }, [
    threadQuery.isSuccess,
    threadQuery.data,
    summaryQuery.data,
    markReadMutation,
    queryClient,
    summaryKey,
  ]);

  // Scroll to the newest message after a send or a live refresh.
  const scrollToBottom = () => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const messages: Message[] = (threadQuery.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse();

  const canSend = draft.trim().length > 0 && draft.length <= 4000;

  const submit = () => {
    if (!canSend || sendMutation.isPending) return;
    setSendError(undefined);
    sendMutation.mutate(
      { body: draft },
      {
        onSuccess: () => {
          setDraft('');
          requestAnimationFrame(scrollToBottom);
        },
        onError: (error) => {
          setSendError(apiErrorMessage(error, 'We could not send your message.'));
        },
      },
    );
  };

  return (
    <section>
      <PageHeader
        title="Messages"
        description="One-to-one chat with the JA&D admin team."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void threadQuery.refetch();
              void summaryQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      />
      <Breadcrumbs
        items={[{ label: 'Dashboard', to: '/member' }, { label: 'Messages' }]}
      />

      {sendError ? (
        <Alert variant="danger" title="Something went wrong">
          {sendError}
        </Alert>
      ) : null}

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
            title="Could not load messages"
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
                  description="Ask the JA&D admin team anything — they will reply right here."
                />
              </div>
            ) : (
              <ul className={styles.list}>
                {messages.map((message) => {
                  const own = message.senderType === 'MEMBER';
                  return (
                    <li
                      key={message.id}
                      className={`${styles.row} ${own ? styles.rowOwn : styles.rowStaff}`}
                    >
                      <div
                        className={`${styles.bubble} ${own ? styles.bubbleOwn : styles.bubbleStaff}`}
                      >
                        <p className={styles.sender}>{own ? 'You' : message.senderName}</p>
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
        <label className={styles.composerLabel} htmlFor="message-draft">
          New message
        </label>
        <textarea
          id="message-draft"
          className={styles.composerInput}
          value={draft}
          maxLength={4000}
          rows={3}
          placeholder="Write a message to the JA&D admin team…"
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
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </section>
  );
}