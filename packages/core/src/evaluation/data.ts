import { evaluationRuns, type TenantTransaction, trustEvents } from '@trustdesk/db';
import { sql } from 'drizzle-orm';
import { HumanLabel, RunReport, RunSummary } from './model.ts';

export async function lockTrust(tx: TenantTransaction, tenantId: string) {
  // Serializes labels, promotions and failed gates without holding a lock during inference.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`trust:${tenantId}`}, 0))`);
}
export async function readRuns(tx: TenantTransaction, tenantId: string, limit = 20) {
  const rows = await tx.query.evaluationRuns.findMany({
    // The overview polls summaries; full outputs are loaded only when inspected.
    columns: {},
    extras: { summary: sql<unknown>`${evaluationRuns.report} - 'results'`.as('summary') },
    where: (run, { eq }) => eq(run.tenantId, tenantId),
    orderBy: (run, { desc }) => [desc(run.createdAt), desc(run.id)],
    limit,
  });
  return rows.map((row) => RunSummary.parse(row.summary));
}
export async function readBaseline(tx: TenantTransaction, tenantId: string) {
  const row = await tx.query.evaluationRuns.findFirst({
    where: (run, { and, eq }) => and(eq(run.tenantId, tenantId), eq(run.accepted, 1)),
    orderBy: (run, { desc }) => [desc(run.createdAt), desc(run.id)],
  });
  return row ? RunReport.parse(row.report) : null;
}
export async function readRun(tx: TenantTransaction, tenantId: string, runId: string) {
  const row = await tx.query.evaluationRuns.findFirst({
    where: (run, { and, eq }) => and(eq(run.tenantId, tenantId), eq(run.id, runId)),
  });
  return row ? RunReport.parse(row.report) : null;
}
export async function readLabels(tx: TenantTransaction, tenantId: string, runId: string) {
  const rows = await tx.query.evaluationLabels.findMany({
    where: (label, { and, eq }) => and(eq(label.tenantId, tenantId), eq(label.runId, runId)),
  });
  return rows.map((row) => HumanLabel.parse({ ...row, createdAt: row.createdAt.toISOString() }));
}
export async function readTrust(
  tx: TenantTransaction,
  tenantId: string,
  agentId: string,
  contextHash: string,
) {
  return tx.query.trustEvents.findFirst({
    where: (event, { and, eq }) =>
      and(
        eq(event.tenantId, tenantId),
        eq(event.agentId, agentId),
        eq(event.contextHash, contextHash),
      ),
    orderBy: (event, { desc }) => [desc(event.createdAt), desc(event.id)],
  });
}
export async function saveRun(tx: TenantTransaction, report: RunReport) {
  await lockTrust(tx, report.tenantId);
  const baseline = await readBaseline(tx, report.tenantId);
  if (report.baselineId !== (baseline?.id ?? null))
    throw new Error('Accepted baseline changed while evaluation ran. Rerun the gate.');
  await tx.insert(evaluationRuns).values({
    tenantId: report.tenantId,
    id: report.id,
    agentId: report.agent.id,
    contextHash: report.contextHash,
    suiteHash: report.suiteHash,
    baselineId: report.baselineId,
    accepted: report.accepted ? 1 : 0,
    report,
    createdAt: new Date(report.createdAt),
  });
  if (!report.gate.passed) {
    // A failed candidate is supervised even if its agent previously had a promotion.
    await tx.insert(trustEvents).values({
      tenantId: report.tenantId,
      id: `gate-${report.id}`,
      agentId: report.agent.id,
      contextHash: report.contextHash,
      runId: report.id,
      level: 'supervised',
      reason: report.gate.reasons.join(' ').slice(0, 1000),
    });
  }
}
