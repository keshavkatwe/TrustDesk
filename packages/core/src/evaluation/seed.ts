import { readdir } from 'node:fs/promises';
import {
  type Database,
  evaluationLabels,
  evaluationRuns,
  trustEvents,
  withTenant,
} from '@trustdesk/db';
import { HumanEvidence, RunReport } from './model.ts';

// Import measured evidence verbatim. This does not call a model or manufacture human labels.
export async function seedEvaluations(database: Database) {
  const directory = new URL('../../../../evals/runs/', import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.json') && !name.endsWith('.partial.json'))
    .sort();
  for (const file of files) {
    const report = RunReport.parse(await Bun.file(new URL(file, directory)).json());
    await withTenant(database, report.tenantId, async (tx) => {
      await tx
        .insert(evaluationRuns)
        .values({
          tenantId: report.tenantId,
          id: report.id,
          agentId: report.agent.id,
          contextHash: report.contextHash,
          suiteHash: report.suiteHash,
          baselineId: report.baselineId,
          accepted: report.accepted ? 1 : 0,
          report,
          createdAt: new Date(report.createdAt),
        })
        .onConflictDoNothing();
      if (!report.gate.passed)
        await tx
          .insert(trustEvents)
          .values({
            tenantId: report.tenantId,
            id: `gate-${report.id}`,
            agentId: report.agent.id,
            contextHash: report.contextHash,
            runId: report.id,
            level: 'supervised',
            reason: report.gate.reasons.join(' ').slice(0, 1000),
            createdAt: new Date(report.createdAt),
          })
          .onConflictDoNothing();
    });
  }
  const humanFile = Bun.file(new URL('../../../../evals/human-evidence.json', import.meta.url));
  if (await humanFile.exists()) {
    const evidence = HumanEvidence.parse(await humanFile.json());
    for (const tenantId of ['qamar', 'rimal'])
      await withTenant(database, tenantId, async (tx) => {
        for (const label of evidence.labels.filter((label) => label.tenantId === tenantId))
          await tx
            .insert(evaluationLabels)
            .values({ ...label, createdAt: new Date(label.createdAt) })
            .onConflictDoNothing();
        for (const event of evidence.events.filter((event) => event.tenantId === tenantId))
          await tx
            .insert(trustEvents)
            .values({ ...event, createdAt: new Date(event.createdAt) })
            .onConflictDoNothing();
      });
  }
  return files.length;
}
