import { z } from 'zod';
import { Generation } from '../ai/model.ts';
import { Assessment, Quote } from '../pricing/model.ts';

export const TenantId = z.enum(['qamar', 'rimal']);
export const InboxParams = z.object({ tenantId: TenantId });
export const ReviewParams = InboxParams.extend({ id: z.string().min(1) });
export const Tenant = z.object({
  id: TenantId,
  name: z.string(),
  shortName: z.string(),
  location: z.string(),
  timezone: z.string(),
  currency: z.enum(['AED', 'SAR']),
  trust: z.literal('supervised'),
  autoSend: z.enum(['low_risk_only', 'off']),
  approvers: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
  receivingChannels: z
    .array(z.object({ channel: z.enum(['whatsapp', 'email', 'webform']), address: z.string() }))
    .default([]),
});
export const ReviewAction = z.enum(['approve', 'reject', 'hand_off']);
export const ReviewInput = z.object({
  approverId: z.string().min(1),
  revision: z.number().int().positive(),
  action: ReviewAction,
  reply: z.string().trim().min(1).max(4000),
  reason: z.string().trim().max(1000),
});
export const InboxItem = z.object({
  id: z.string(),
  tenantId: TenantId,
  sourceEvent: z.string(),
  provenance: z.enum(['sample', 'openai', 'received']).default('sample'),
  processingState: z
    .enum(['queued', 'processing', 'ready', 'failed', 'superseded'])
    .default('ready'),
  draftVersion: z.number().int().positive().default(1),
  generation: Generation.nullable().default(null),
  draftGeneration: Generation.nullable().default(null),
  assessment: Assessment.nullable().default(null),
  title: z.string(),
  customer: z.string(),
  channel: z.enum(['WhatsApp', 'Email', 'Web form']),
  language: z.enum(['Arabic', 'English', 'Mixed']),
  receivedAt: z.string(),
  body: z.string(),
  context: z.array(z.object({ label: z.string(), body: z.string() })),
  extracted: z.array(z.object({ label: z.string(), value: z.string() })),
  missing: z.array(z.string()),
  reasons: z.array(z.object({ title: z.string(), detail: z.string(), source: z.string() })),
  quote: Quote.nullable(),
  draftReply: z.string(),
  status: z.enum(['needs_approval', 'approved', 'rejected', 'handed_off', 'superseded']),
  revision: z.number().int().positive(),
  recommendedAction: ReviewAction,
  supersededBy: z.string().nullable(),
  outbox: z
    .object({
      id: z.string(),
      status: z.enum(['pending', 'simulated_sent', 'cancelled']),
      createdAt: z.string(),
      completedAt: z.string().nullable().default(null),
      reason: z.string().nullable().default(null),
      simulatedMessageId: z.string().nullable().default(null),
    })
    .nullable(),
  decision: z
    .object({
      action: ReviewAction,
      approverName: z.string(),
      at: z.string(),
      originalReply: z.string(),
      reply: z.string(),
      reason: z.string(),
      editDiff: z.object({
        start: z.number().int().nonnegative(),
        removed: z.string(),
        added: z.string(),
      }),
    })
    .nullable(),
});
export const Workspace = z.object({ tenants: z.array(Tenant) });
export const Inbox = z.object({ items: z.array(InboxItem) });
export const InboxError = z.object({ message: z.string() });
export type Tenant = z.infer<typeof Tenant>;
export type InboxItem = z.infer<typeof InboxItem>;
export type ReviewInput = z.infer<typeof ReviewInput>;
export const DraftEvidence = InboxItem.pick({
  assessment: true,
  title: true,
  language: true,
  context: true,
  extracted: true,
  missing: true,
  reasons: true,
  quote: true,
  recommendedAction: true,
  supersededBy: true,
});
