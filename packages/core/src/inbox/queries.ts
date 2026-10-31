import type { TenantTransaction } from '@trustdesk/db';
import { DraftEvidence, InboxItem } from './model.ts';

export async function readItems(tx: TenantTransaction, tenantId: string, id?: string) {
  const runColumns = {
    id: true,
    status: true,
    model: true,
    promptVersion: true,
    errorCode: true,
    responseId: true,
    usage: true,
    durationMs: true,
    createdAt: true,
  } as const;
  const data = await tx.query.drafts.findMany({
    where: (draft, { and, eq }) =>
      id ? and(eq(draft.tenantId, tenantId), eq(draft.id, id)) : eq(draft.tenantId, tenantId),
    with: {
      message: {
        with: {
          conversation: true,
          aiRuns: {
            columns: runColumns,
            where: (run, { eq }) => eq(run.tenantId, tenantId),
            orderBy: (run, { desc }) => desc(run.createdAt),
            limit: 1,
          },
        },
      },
      review: { with: { outbox: { with: { delivery: true } } } },
      resultRuns: {
        columns: runColumns,
        where: (run, { eq }) => eq(run.tenantId, tenantId),
        orderBy: (run, { desc }) => desc(run.createdAt),
        limit: 1,
      },
    },
  });
  // Inbox ordering uses the related message's timestamp, then the draft version.
  data.sort(
    (a, b) =>
      b.message.receivedAt.getTime() - a.message.receivedAt.getTime() || b.version - a.version,
  );
  return data.map((draft) => {
    const { message, review } = draft;
    const { conversation } = message;
    const intent = review?.outbox;
    const delivery = intent?.delivery;
    const latestRun = message.aiRuns[0];
    const originatingRun = draft.resultRuns[0];
    return InboxItem.parse({
      ...DraftEvidence.parse(draft.evidence),
      id: draft.id,
      tenantId,
      sourceEvent: message.sourceEvent,
      provenance: draft.provenance,
      processingState: message.processingState,
      draftVersion: draft.version,
      generation: latestRun ? { ...latestRun, createdAt: latestRun.createdAt.toISOString() } : null,
      draftGeneration: originatingRun
        ? { ...originatingRun, createdAt: originatingRun.createdAt.toISOString() }
        : null,
      customer: conversation.customer,
      channel:
        message.channel === 'whatsapp'
          ? 'WhatsApp'
          : message.channel === 'email'
            ? 'Email'
            : 'Web form',
      receivedAt: message.receivedAt.toISOString(),
      body: message.body,
      draftReply: review?.reply ?? draft.originalReply,
      status: draft.status,
      revision: draft.revision,
      decision: review
        ? {
            action: review.action,
            approverName: review.approverName,
            at: review.createdAt.toISOString(),
            originalReply: review.originalReply,
            reply: review.reply,
            reason: review.reason,
            editDiff: review.editDiff,
          }
        : null,
      outbox: intent
        ? {
            id: intent.id,
            status: delivery?.status ?? intent.status,
            createdAt: intent.createdAt.toISOString(),
            completedAt: delivery?.createdAt.toISOString() ?? null,
            reason: delivery?.reason ?? null,
            simulatedMessageId: delivery?.simulatedMessageId ?? null,
          }
        : null,
    });
  });
}

export async function readBusiness(tx: TenantTransaction, tenantId: string) {
  const tenant = await tx.query.tenants.findFirst({
    where: (tenant, { eq }) => eq(tenant.id, tenantId),
    columns: {
      id: true,
      name: true,
      shortName: true,
      location: true,
      timezone: true,
      currency: true,
      autoSend: true,
    },
    with: {
      approvers: {
        columns: { id: true, name: true, role: true },
        where: (actor, { eq }) => eq(actor.tenantId, tenantId),
        orderBy: (actor, { asc }) => asc(actor.id),
      },
      receivingChannels: {
        columns: { channel: true, address: true },
        where: (channel, { eq }) => eq(channel.tenantId, tenantId),
      },
    },
  });
  if (!tenant) return undefined;
  return {
    id: tenant.id,
    name: tenant.name,
    shortName: tenant.shortName,
    location: tenant.location,
    timezone: tenant.timezone,
    currency: tenant.currency,
    autoSend: tenant.autoSend,
    trust: 'supervised' as const,
    approvers: tenant.approvers,
    receivingChannels: tenant.receivingChannels,
  };
}
