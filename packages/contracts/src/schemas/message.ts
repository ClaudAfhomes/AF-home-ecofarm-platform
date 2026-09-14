import { z } from 'zod';

/**
 * Admin↔member messaging — one conversation thread per member
 * (API-SPECIFICATION #90–#94, FEAT-072, ADR-013). Text-only v1; the UI
 * renders `body` as plain text (React-escaped), never as HTML.
 */
export const messageSenderTypeSchema = z.enum(['MEMBER', 'STAFF']);

export type MessageSenderType = z.infer<typeof messageSenderTypeSchema>;

/** One chat message in a member's thread (API + member view + admin thread view). */
export const messageSchema = z.object({
  id: z.string().min(1),
  senderType: messageSenderTypeSchema,
  senderName: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.string(),
});

export type Message = z.infer<typeof messageSchema>;

/** GET /me/messages/summary — member thread badge (unread staff replies). */
export const conversationSummarySchema = z.object({
  unreadCount: z.number().int().min(0),
  lastMessageAt: z.string().optional(),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** GET /admin/conversations — one inbox row per member with a thread. */
export const adminConversationSchema = z.object({
  memberId: z.string().min(1),
  memberName: z.string().min(1),
  memberEmail: z.string().min(1),
  lastMessageAt: z.string().optional(),
  lastMessagePreview: z.string().optional(),
  unreadCount: z.number().int().min(0),
});

export type AdminConversation = z.infer<typeof adminConversationSchema>;

/** GET /admin/messages/summary — admin inbox badge. */
export const adminMessagesSummarySchema = z.object({
  unreadCount: z.number().int().min(0),
  unreadConversations: z.number().int().min(0),
});

export type AdminMessagesSummary = z.infer<typeof adminMessagesSummarySchema>;

/** POST /me/messages + POST /admin/conversations/:memberId/messages. */
export const createMessageRequestSchema = z.object({
  body: z.string().trim().min(1, 'Enter a message.').max(4000),
});

export type CreateMessageRequest = z.infer<typeof createMessageRequestSchema>;

/** POST /me/messages/read + POST /admin/conversations/:memberId/read. */
export const markMessagesReadResponseSchema = z.object({
  readAt: z.string(),
});

export type MarkMessagesReadResponse = z.infer<typeof markMessagesReadResponseSchema>;
