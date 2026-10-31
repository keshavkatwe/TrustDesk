import { z } from 'zod';
import { TenantId } from '../inbox/model.ts';
import type { Failure } from '../result.ts';
export const SourceEvent = z.object({
  event_id: z.string().min(1).max(200),
  channel: z.enum(['whatsapp', 'email', 'webform']),
  to: z.string().trim().min(1).max(200),
  from: z.string().trim().min(1).max(200),
  message_id: z.string().min(1).max(200),
  sent_at: z.iso.datetime({ offset: true }).optional(),
  received_at: z.iso.datetime({ offset: true }),
  text: z
    .string()
    .min(1)
    .max(12000)
    .refine((text) => text.trim().length > 0),
  metadata: z
    .object({ tenant_id: z.string().max(100).optional(), source: z.string().max(200).optional() })
    .optional(),
});
export const ReceiptResult = z.object({
  tenantId: TenantId,
  receiptId: z.string(),
  messageId: z.string(),
  draftId: z.string(),
  outcome: z.enum(['accepted', 'duplicate']),
});
export type ReceiptResult = z.infer<typeof ReceiptResult>;
export type SourceEvent = z.infer<typeof SourceEvent>;

export type ReceiveResult =
  | ({ ok: true } & ReceiptResult)
  | Failure<'invalid_request' | 'unknown_destination' | 'message_conflict'>;
