import { z } from 'zod';

/**
 * Member notification feed - `GET /me/broadcasts` (API-SPECIFICATION #73,
 * FEAT-063, FR-ADM-005). Derived from `broadcasts`/`notifications`
 * (DATABASE-DESIGN §7.25/§7.26). Titles/labels come from the API, never
 * invented in the UI.
 */
export const notificationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  createdAt: z.string(),
  readAt: z.string().optional(),
});

export type Notification = z.infer<typeof notificationSchema>;

/** POST /broadcasts - admin announcement to all members (API-SPECIFICATION #72, FEAT-063). */
export const createBroadcastRequestSchema = z.object({
  title: z.string().trim().min(1, 'Enter an announcement title.').max(200),
  body: z.string().trim().max(5000).optional(),
});

export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequestSchema>;

/** POST /me/broadcasts/:id/read - per-member read receipt (idempotent). */
export const markNotificationReadResponseSchema = z.object({
  id: z.string().min(1),
  readAt: z.string(),
});

export type MarkNotificationReadResponse = z.infer<typeof markNotificationReadResponseSchema>;

/** POST /me/broadcasts/read-all - receipts for every visible unread item. */
export const readAllNotificationsResponseSchema = z.object({
  updated: z.number().int().min(0),
});

export type ReadAllNotificationsResponse = z.infer<typeof readAllNotificationsResponseSchema>;
