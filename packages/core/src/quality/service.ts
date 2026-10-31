import { type Database, withTenant } from '@trustdesk/db';
import { DEFAULT_MODEL, PROMPT_VERSION } from '../ai/model.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { ENGINE_VERSION } from '../pricing/evaluate.ts';
import { QUALITY_ATTEMPT_LIMIT, QualityAttemptDetail, QualityOverview } from './model.ts';
import { readAttempts, toAttempt } from './queries.ts';
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

export type QualityService = ReturnType<typeof createQualityService>;
