import { randomUUID } from 'node:crypto';
import { type Database, evaluationLabels, trustEvents, withTenant } from '@trustdesk/db';
import { DEFAULT_MODEL } from '../ai/model.ts';
import { agentVersion, pricingVersion } from '../ai/version.ts';
import { loadPricingContext } from '../pricing/context.ts';
import { failure } from '../result.ts';
import { lockTrust, readLabels, readRun, readRuns, readTrust } from './data.ts';
import { calibration } from './gate.ts';
import { EvaluationOverview, LabelInput, PromoteInput, RunDetail } from './model.ts';

export function createEvaluationService(
  database: Database,
  allowedTenantIds: readonly string[],
  model = DEFAULT_MODEL,
) {
  const allowed = new Set(allowedTenantIds);
  return {
    async overview(tenantId: string) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const context = await loadPricingContext(tx, tenantId);
        const agentId = agentVersion(model).id,
          contextHash = pricingVersion(context);
        const runs = await readRuns(tx, tenantId);
        const current = await readTrust(tx, tenantId, agentId, contextHash);
        const events = await tx.query.trustEvents.findMany({
          where: (event, { eq }) => eq(event.tenantId, tenantId),
          orderBy: (event, { desc }) => [desc(event.createdAt), desc(event.id)],
          limit: 30,
        });
        const latestCurrent = runs.find(
          (run) => run.agent.id === agentId && run.contextHash === contextHash,
        );
        return EvaluationOverview.parse({
          currentAgentId: agentId,
          currentContextHash: contextHash,
          runs,
          trust: {
            level: current?.level ?? 'supervised',
            reason:
              current?.level !== 'autonomous' && latestCurrent?.gate.passed
                ? 'Current evaluation passes. Independent human calibration and a named promotion are required before autonomy.'
                : (current?.reason ??
                  'This business and agent version have no named promotion backed by calibrated evaluations.'),
            at: current?.createdAt.toISOString() ?? null,
            by: current?.approverName ?? null,
          },
          ledger: events.map((event) => ({
            ...event,
            at: event.createdAt.toISOString(),
            by: event.approverName,
          })),
        });
      });
    },
    async run(tenantId: string, runId: string) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const report = await readRun(tx, tenantId, runId);
        if (!report) return undefined;
        const labels = await readLabels(tx, tenantId, runId);
        return RunDetail.parse({
          report,
          labels,
          calibration: calibration(report.results, labels),
        });
      });
    },
    async label(tenantId: string, runId: string, raw: unknown) {
      if (!allowed.has(tenantId)) return failure('not_found', 'Business not found.');
      const input = LabelInput.safeParse(raw);
      if (!input.success) return failure('invalid_request', 'Invalid human label.');
      return withTenant(database, tenantId, async (tx) => {
        await lockTrust(tx, tenantId);
        const report = await readRun(tx, tenantId, runId);
        const approver = await tx.query.approvers.findFirst({
          where: (person, { and, eq }) =>
            and(eq(person.tenantId, tenantId), eq(person.id, input.data.approverId)),
        });
        if (
          !report ||
          !approver ||
          !report.results.some((result) => result.case.id === input.data.caseId)
        )
          return failure('not_found', 'Run, case or reviewer not found in this business.');
        const existing = await readLabels(tx, tenantId, runId);
        if (existing.some((label) => label.caseId === input.data.caseId))
          return failure('conflict', 'This output already has an immutable human label.');
        await tx
          .insert(evaluationLabels)
          .values({ tenantId, runId, ...input.data, approverName: approver.name });
        // A negative human judgement revokes the evaluated version immediately.
        if (Object.values(input.data.dimensions).some((grade) => grade !== 'pass'))
          await tx.insert(trustEvents).values({
            tenantId,
            id: randomUUID(),
            runId,
            agentId: report.agent.id,
            contextHash: report.contextHash,
            level: 'supervised',
            reason: `Human calibration found a failure or unassessable dimension in ${input.data.caseId}.`,
            approverId: approver.id,
            approverName: approver.name,
          });
        return { ok: true as const };
      });
    },
    async promote(tenantId: string, raw: unknown) {
      if (!allowed.has(tenantId)) return failure('not_found', 'Business not found.');
      const input = PromoteInput.safeParse(raw);
      if (!input.success) return failure('invalid_request', 'Invalid promotion request.');
      return withTenant(database, tenantId, async (tx) => {
        // Same order as settings: tenant configuration first, then trust lock.
        const context = await loadPricingContext(tx, tenantId);
        await lockTrust(tx, tenantId);
        const report = await readRun(tx, tenantId, input.data.runId);
        const approver = await tx.query.approvers.findFirst({
          where: (person, { and, eq }) =>
            and(eq(person.tenantId, tenantId), eq(person.id, input.data.approverId)),
        });
        if (!report || !approver) return failure('not_found', 'Run or reviewer not found.');
        const labels = await readLabels(tx, tenantId, report.id);
        const latest = (await readRuns(tx, tenantId)).find(
          (run) => run.agent.id === report.agent.id && run.contextHash === report.contextHash,
        );
        if (
          !report.accepted ||
          !report.gate.passed ||
          report.agent.id !== agentVersion(model).id ||
          report.contextHash !== pricingVersion(context) ||
          latest?.id !== report.id ||
          !calibration(report.results, labels).ready
        )
          return failure(
            'conflict',
            'Promotion needs the latest accepted passing run for the current configuration, five assessed human labels and at least 90% judge agreement, with no human failures.',
          );
        await tx.insert(trustEvents).values({
          tenantId,
          id: randomUUID(),
          agentId: report.agent.id,
          contextHash: report.contextHash,
          runId: report.id,
          level: 'autonomous',
          approverId: approver.id,
          approverName: approver.name,
          reason: input.data.reason,
        });
        return { ok: true as const };
      });
    },
  };
}
export type EvaluationService = ReturnType<typeof createEvaluationService>;
