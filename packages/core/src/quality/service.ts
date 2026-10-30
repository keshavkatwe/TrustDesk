import { type Database, type TenantTransaction, withTenant } from '@trustdesk/db';
import { DEFAULT_MODEL, PROMPT_VERSION, Usage } from '../ai/model.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { ENGINE_VERSION } from '../pricing/evaluate.ts';
import {
  QUALITY_ATTEMPT_LIMIT,
  QualityAttempt,
  QualityAttemptDetail,
  QualityOverview,
} from './model.ts';
import { summarizeAttempts } from './summary.ts';

export function createQualityService(
  database: Database,
  allowedTenantIds: readonly string[],
  model = DEFAULT_MODEL,
) {
  const allowed = new Set(allowedTenantIds);
  return {
    async overview(tenantId: string): Promise<QualityOverview | undefined> {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const tenant = await tx.query.tenants.findFirst({
          columns: { autoSend: true },
          where: (tenant, { eq }) => eq(tenant.id, tenantId),
        });
        if (!tenant) return undefined;
        const catalogue = await tx.query.catalogueVersions.findFirst({
          columns: { version: true },
          where: (catalogue, { eq }) => eq(catalogue.tenantId, tenantId),
          orderBy: (catalogue, { desc }) => [desc(catalogue.createdAt), desc(catalogue.version)],
        });
        const attempts = (await readAttempts(tx, tenantId)).map(toAttempt);
        return QualityOverview.parse({
          tenantId,
          updatedAt: new Date().toISOString(),
          attemptLimit: QUALITY_ATTEMPT_LIMIT,
          configuration: {
            model,
            promptVersion: PROMPT_VERSION,
            engineVersion: ENGINE_VERSION,
            catalogueVersion: catalogue?.version ?? null,
            autoSend: tenant.autoSend,
          },
          // Operational reviews are not calibrated evaluation labels or a promotion decision.
          trust: { level: 'supervised', promotionAvailable: false },
          summary: summarizeAttempts(attempts),
          attempts,
        });
      });
    },
    async attempt(tenantId: string, runId: string): Promise<QualityAttemptDetail | undefined> {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const [run] = await readAttempts(tx, tenantId, runId);
        if (!run) return undefined;
        const evidence = DraftEvidence.safeParse(run.resultDraft?.evidence);
        return QualityAttemptDetail.parse({
          ...toAttempt(run),
          sourceDraftId: run.sourceDraftId,
          body: run.message.body,
          // A failed regeneration must never claim the source draft as its new output.
          reply: run.resultDraft?.originalReply ?? null,
          assessment: evidence.success ? evidence.data.assessment : null,
          inputHash: run.inputHash,
          finishedAt: run.finishedAt?.toISOString() ?? null,
        });
      });
    },
  };
}

function readAttempts(tx: TenantTransaction, tenantId: string, runId?: string) {
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

function toAttempt(run: StoredAttempt): QualityAttempt {
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

export type QualityService = ReturnType<typeof createQualityService>;
