import { describe, expect, it } from 'vitest';

import {
  adminConversationSchema,
  adminMessagesSummarySchema,
  conversationSummarySchema,
  createMessageRequestSchema,
  markMessagesReadResponseSchema,
  messageSchema,
} from './message';

const validMessage = {
  id: 'msg-abc123',
  senderType: 'STAFF',
  senderName: 'Ada Admin',
  body: 'Hello, how can we help?',
  createdAt: '2026-09-14T00:00:00.000Z',
};

describe('messageSchema', () => {
  it('accepts a valid member or staff message', () => {
    expect(messageSchema.safeParse(validMessage).success).toBe(true);
    expect(
      messageSchema.safeParse({ ...validMessage, senderType: 'MEMBER', senderName: 'Juan' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown sender types and empty bodies', () => {
    expect(messageSchema.safeParse({ ...validMessage, senderType: 'SYSTEM' }).success).toBe(false);
    expect(messageSchema.safeParse({ ...validMessage, body: '' }).success).toBe(false);
  });
});

describe('createMessageRequestSchema', () => {
  it('trims and bounds plain-text bodies', () => {
    expect(createMessageRequestSchema.safeParse({ body: '  hi  ' }).success).toBe(true);
    expect(createMessageRequestSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(createMessageRequestSchema.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false);
    expect(createMessageRequestSchema.safeParse({ body: 'x'.repeat(4000) }).success).toBe(true);
  });
});

describe('conversation and summary schemas', () => {
  it('accepts read and summary payloads', () => {
    expect(conversationSummarySchema.safeParse({ unreadCount: 2 }).success).toBe(true);
    expect(conversationSummarySchema.safeParse({ unreadCount: -1 }).success).toBe(false);
    expect(
      adminConversationSchema.safeParse({
        memberId: '11111111-1111-4111-8111-111111111111',
        memberName: 'Juan',
        memberEmail: 'juan@example.com',
        unreadCount: 1,
      }).success,
    ).toBe(true);
    expect(
      adminMessagesSummarySchema.safeParse({ unreadCount: 3, unreadConversations: 2 }).success,
    ).toBe(true);
    expect(
      markMessagesReadResponseSchema.safeParse({ readAt: '2026-09-14T00:00:00.000Z' }).success,
    ).toBe(true);
  });
});
