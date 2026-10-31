import type { TenantTransaction } from '@trustdesk/db';
import { Usage } from '../ai/model.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { QUALITY_ATTEMPT_LIMIT, QualityAttempt } from './model.ts';

export function readAttempts(tx: TenantTransaction, tenantId: string, runId?: string) {
  return tx.query.aiRuns.findMany({
    columns: {
      id: true,
      sourceDraftId: true,
      resultDraftId: true,
      status: true,
      model: true,
      promptVersion: true,
      errorCode: true,
      responseId: true,
      usage: true,
      durationMs: true,
      inputHash: true,
      createdAt: true,
      finishedAt: true,
    },
    where: (run, { and, eq }) =>
      and(eq(run.tenantId, tenantId), runId ? eq(run.id, runId) : undefined),
    orderBy: (run, { desc }) => [desc(run.createdAt), desc(run.id)],
    limit: runId ? 1 : QUALITY_ATTEMPT_LIMIT,
    with: {
      message: {
        columns: { sourceEvent: true, channel: true, body: true },
        with: { conversation: { columns: { customer: true } } },
      },
      sourceDraft: { columns: { evidence: true } },
      resultDraft: {
        columns: { evidence: true, originalReply: true },
        with: {
          review: {
            columns: {
              action: true,
              approverName: true,
              createdAt: true,
              originalReply: true,
              reply: true,
            },
          },
        },
      },
    },
  });
}

type StoredAttempt = Awaited<ReturnType<typeof readAttempts>>[number];

export function toAttempt(run: StoredAttempt): QualityAttempt {
  const evidence = DraftEvidence.safeParse(run.resultDraft?.evidence ?? run.sourceDraft.evidence);
  const usage = Usage.safeParse(run.usage);
  const review = run.resultDraft?.review;
  return QualityAttempt.parse({
    id: run.id,
    status: run.status,
    model: run.model,
    promptVersion: run.promptVersion,
    errorCode: run.errorCode,
    responseId: run.responseId,
    usage: usage.success ? usage.data : null,
    durationMs: run.durationMs,
    createdAt: run.createdAt.toISOString(),
    title: evidence.success ? evidence.data.title : 'Customer enquiry',
    sourceEvent: run.message.sourceEvent,
    customer: run.message.conversation.customer,
    channel: run.message.channel,
    resultDraftId: run.resultDraftId,
    review: review
      ? {
          action: review.action,
          reviewer: review.approverName,
          at: review.createdAt.toISOString(),
          edited: review.originalReply !== review.reply,
        }
      : null,
  });
}
