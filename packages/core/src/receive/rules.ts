import { createHash } from 'node:crypto';
import type { drafts, eventReceipts, messages } from '@trustdesk/db';
import { DraftEvidence } from '../inbox/model.ts';
import type { ReceiptResult, SourceEvent } from './model.ts';

type TenantId = ReceiptResult['tenantId'];
type ReceiptOutcome = typeof eventReceipts.$inferInsert.outcome;

export function classifyDelivery(
  event: SourceEvent,
  existing: { body: string; conversation: { customer: string } } | undefined,
): ReceiptOutcome {
  if (!existing) return 'accepted';
  return existing.body === event.text && existing.conversation.customer === event.from
    ? 'duplicate'
    : 'conflict';
}

export function prepareReceipt(
  tenantId: TenantId,
  event: SourceEvent,
  messageId: string,
  receiptId: string,
  outcome: ReceiptOutcome,
) {
  return {
    tenantId,
    id: receiptId,
    eventId: event.event_id,
    messageId,
    bodyHash: createHash('sha256').update(event.text).digest('hex'),
    claimedTenant: event.metadata?.tenant_id ?? null,
    outcome,
  } satisfies typeof eventReceipts.$inferInsert;
}

export function prepareMessage(
  tenantId: TenantId,
  event: SourceEvent,
  conversation: { id: string; latestSequence: number },
  messageId: string,
  draftId: string,
) {
  return {
    message: {
      tenantId,
      id: messageId,
      conversationId: conversation.id,
      sequence: conversation.latestSequence,
      channel: event.channel,
      channelMessageId: event.message_id,
      sourceEvent: event.event_id,
      body: event.text,
      receivedAt: new Date(event.received_at),
      processingState: 'queued',
    } satisfies typeof messages.$inferInsert,
    draft: {
      tenantId,
      id: draftId,
      messageId,
      status: 'needs_approval',
      provenance: 'received',
      originalReply: 'This enquiry needs a team member to review it before a reply is prepared.',
      evidence: DraftEvidence.parse({
        title: 'New enquiry · preparing draft',
        language: /[\u0600-\u06ff]/u.test(event.text) ? 'Arabic' : 'English',
        context: [],
        extracted: [],
        missing: [],
        reasons: [
          {
            title: 'AI drafting queued',
            detail: 'No AI reply has been prepared yet.',
            source: 'message processing',
          },
        ],
        assessment: null,
        quote: null,
        recommendedAction: 'hand_off',
        supersededBy: null,
      }),
    } satisfies typeof drafts.$inferInsert,
  };
}

export type NewMessage = ReturnType<typeof prepareMessage>;
