import { z } from 'zod';

/**
 * Contact inquiries - `POST /contact` (PUBLIC) stores a message from the
 * public Contact page; staff triage them via `GET/PATCH /admin/inquiries`
 * (staff `cms` module). Honeypot field `company` must stay empty - bots fill
 * it, humans never see it.
 */

/** `POST /contact` - public submission (FR-PUB contact form). */
export const contactSubmissionRequestSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.'),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(5000),
  company: z.string().max(120).optional(),
});

export type ContactSubmissionRequest = z.infer<typeof contactSubmissionRequestSchema>;

/** `POST /contact` response - the stored inquiry id for reference. */
export const contactSubmissionResponseSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
});

export type ContactSubmissionResponse = z.infer<typeof contactSubmissionResponseSchema>;

export const contactInquiryStatusSchema = z.enum(['NEW', 'READ', 'ARCHIVED']);

export type ContactInquiryStatus = z.infer<typeof contactInquiryStatusSchema>;

/** Admin inquiry DTO - `GET /admin/inquiries`. */
export const contactInquirySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1),
  status: contactInquiryStatusSchema,
  createdAt: z.string(),
  handledAt: z.string().nullable().optional(),
  handledBy: z.string().nullable().optional(),
});

export type ContactInquiry = z.infer<typeof contactInquirySchema>;

/** `PATCH /admin/inquiries/:id` - triage the inquiry. */
export const contactInquiryUpdateSchema = z.object({
  status: contactInquiryStatusSchema,
});

export type ContactInquiryUpdateRequest = z.infer<typeof contactInquiryUpdateSchema>;
