import { readdir } from 'node:fs/promises';
import { hash, sameConfiguration } from '../packages/core/src/ai/version.ts';
import { regressionGate } from '../packages/core/src/evaluation/gate.ts';
import { RunReport } from '../packages/core/src/evaluation/model.ts';

// Recompute the saved gate, not inference. No credentials, database or model calls.
const directory = new URL('../evals/runs/', import.meta.url);
const reports = await Promise.all(
  (await readdir(directory))
    .filter((file) => file.endsWith('.json') && !file.endsWith('.partial.json'))
    .map(async (file) => RunReport.parse(await Bun.file(new URL(file, directory)).json())),
);
for (const tenantId of ['qamar', 'rimal']) {
  const runs = reports
    .filter((report) => report.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const degraded = runs.find((run) => run.variant === 'degraded');
  const baseline = reports.find((run) => run.id === degraded?.baselineId && run.accepted);
  if (!baseline || !degraded) throw new Error(`Missing real baseline/degraded pair: ${tenantId}`);
  const comparable =
    baseline.suiteHash === degraded.suiteHash &&
    baseline.contextHash === degraded.contextHash &&
    sameConfiguration(baseline.judge, degraded.judge);
  const gate = regressionGate(degraded.results, baseline, comparable);
  if (gate.passed || !baseline.gate.passed || hash(gate) !== hash(degraded.gate))
    throw new Error(`Saved regression evidence does not verify: ${tenantId}`);
  console.log(
    `${tenantId}: baseline ${baseline.gate.passedCases}/${baseline.gate.total}; degraded ${gate.passedCases}/${gate.total}; BLOCKED, ${gate.regressions.length} regressions. Saved gate verified.`,
  );
}
