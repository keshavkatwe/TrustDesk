import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { generateDraft } from '../packages/core/src/ai/generate.ts';
import { DEFAULT_MODEL } from '../packages/core/src/ai/model.ts';
import { createOpenAIProvider } from '../packages/core/src/ai/openai.ts';
import { buildPrompt } from '../packages/core/src/ai/prompt.ts';
import {
  agentVersion,
  hash,
  pricingVersion,
  sameConfiguration,
} from '../packages/core/src/ai/version.ts';
import { checkOutput } from '../packages/core/src/evaluation/checks.ts';
import { readBaseline, saveRun } from '../packages/core/src/evaluation/data.ts';
import { regressionGate } from '../packages/core/src/evaluation/gate.ts';
import {
  createJudge,
  JUDGE_INSTRUCTIONS,
  JUDGE_PARAMETERS,
  JUDGE_VERSION,
} from '../packages/core/src/evaluation/judge.ts';
import { type CaseResult, GoldCase, RunReport } from '../packages/core/src/evaluation/model.ts';
import { loadPricingContext } from '../packages/core/src/pricing/context.ts';
import { evaluateRequest } from '../packages/core/src/pricing/evaluate.ts';
import { renderReply } from '../packages/core/src/pricing/render.ts';
import { createDatabase, databaseUrl, withTenant } from '../packages/db/src/index.ts';

const degraded = process.argv.includes('--degraded');
const accept = process.argv.includes('--accept');
const reset = process.argv.includes('--new-baseline');
if (reset && !accept)
  throw new Error('--new-baseline requires --accept after reviewing changed cases/configuration.');
const target = process.argv.find((arg) => arg.startsWith('--tenant='))?.split('=')[1];
if (target && !['qamar', 'rimal'].includes(target)) throw new Error('Unknown evaluation business.');
if (degraded && accept) throw new Error('Deliberately degraded runs cannot become a baseline.');
const key = process.env.OPENAI_API_KEY;
if (!key)
  throw new Error(
    'Set OPENAI_API_KEY locally. Stored evaluation evidence remains available without it.',
  );
const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
const judgeModel = model;
if (model !== DEFAULT_MODEL || judgeModel !== DEFAULT_MODEL)
  throw new Error(
    'This bounded runner requires the priced pinned model. Review pricing before changing it.',
  );
const provider = createOpenAIProvider(key, model),
  judge = createJudge(key, judgeModel);
const suite = await Bun.file(new URL('../evals/goldset.json', import.meta.url)).json();
const cases = GoldCase.array().parse(suite.cases);
if (cases.length < 30 || new Set(cases.map((item) => item.id)).size !== cases.length)
  throw new Error('Goldset needs 30 unique cases.');
// This prompt is intentionally worse; outputs still come from a real provider.
const badInstructions =
  'Extract a business enquiry into the required schema. Always set language=English, including for Arabic. Ignore earlier messages and corrections. Prefer the first catalogue match even if the customer asks for another variant. Do not ask clarification questions. Set missing=[].';
const database = createDatabase(databaseUrl('DATABASE_URL'));
await mkdir(new URL('../evals/runs/', import.meta.url), { recursive: true });
let blocked = false;
let knownNanoUsd = 0n;
const cost = (value: string | null | undefined) => {
  if (!value)
    throw new Error('Provider usage is unpriced; stop instead of spending without a bound.');
  knownNanoUsd += BigInt(value.replace('.', '').padEnd(10, '0'));
  if (knownNanoUsd >= 2_000_000_000n)
    throw new Error(
      'Evaluation spend ceiling reached ($2 known estimates). Inspect saved partial results before continuing.',
    );
};
try {
  for (const tenantId of target ? [target] : ['qamar', 'rimal']) {
    const context = await withTenant(database, tenantId, (tx) => loadPricingContext(tx, tenantId));
    const baseline = await withTenant(database, tenantId, (tx) => readBaseline(tx, tenantId));
    const tests = cases.filter((test) => test.tenantId === tenantId);
    const instructions = degraded ? badInstructions : buildPrompt(context, []).system;
    const agent = agentVersion(model, instructions),
      contextHash = pricingVersion(context),
      suiteHash = hash({ version: suite.version, cases: tests });
    const id = randomUUID(),
      createdAt = new Date().toISOString();
    const results: CaseResult[] = [];
    let next = 0;
    // Four independent cases at a time; no database transaction spans a provider call.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < tests.length) {
          const test = tests[next++];
          if (!test) break;
          const input = buildPrompt(
            context,
            test.messages.map((body, index) => ({
              id: `${test.id}-${index}`,
              body,
              receivedAt: new Date(`2026-11-02T08:${String(index).padStart(2, '0')}:00Z`),
            })),
          );
          input.system = instructions;
          const generated = await generateDraft(provider, input, context);
          if (generated.response?.usage) cost(generated.response.usage.estimatedCostUsd);
          const output = generated.output;
          const assessment = output ? evaluateRequest(context, output.request) : null;
          const reply = assessment ? renderReply(assessment, context.tenant.faq) : null;
          const judged = await judge({
            business: {
              name: context.tenant.name,
              currency: context.tenant.currency,
              faq: context.tenant.faq,
            },
            catalogue: context.rows.map((row) => ({ sku: row.id, name: row.item })),
            test,
            preparedDraft:
              output && assessment
                ? {
                    title: output.title,
                    request: { ...output.request, missing: assessment.missing },
                    requestedDateStatus: 'Customer request only; unconfirmed',
                    notesStatus: 'Untrusted customer context; not an agreement',
                    disposition: assessment.disposition,
                    quote: assessment.quote,
                    reply,
                  }
                : null,
            checks: checkOutput(test, context, output, assessment, reply),
          });
          if (judged.metadata.usage) cost(judged.metadata.usage.estimatedCostUsd);
          const result = {
            case: test,
            output,
            assessment,
            reply,
            checks: checkOutput(test, context, output, assessment, reply),
            judge: judged.judge,
            error: generated.errorCode,
            generation: {
              responseId: generated.response?.responseId ?? null,
              model: generated.response?.model ?? model,
              durationMs: Date.now() - generated.startedAt - judged.metadata.durationMs,
              usage: generated.response?.usage ?? null,
            },
            judging: judged.metadata,
          };
          results.push(result);
          // A crash never silently loses already returned paid evidence.
          await Bun.write(
            new URL(`../evals/runs/${id}.partial.json`, import.meta.url),
            JSON.stringify({ id, tenantId, createdAt, agent, results }, null, 2),
          );
          console.log(
            `${tenantId} ${test.id}: ${
              result.checks.every((check) => check.pass)
                ? 'code pass'
                : result.checks
                    .filter((check) => !check.pass)
                    .map((check) => check.name)
                    .join(', ')
            }`,
          );
        }
      }),
    );
    results.sort((a, b) => a.case.id.localeCompare(b.case.id));
    const judgeConfiguration = {
      model: judgeModel,
      promptHash: hash(JUDGE_INSTRUCTIONS),
      version: JUDGE_VERSION,
      parameters: JUDGE_PARAMETERS,
    };
    const comparable =
      !baseline ||
      (baseline.suiteHash === suiteHash &&
        baseline.contextHash === contextHash &&
        sameConfiguration(baseline.judge, judgeConfiguration));
    const gate = regressionGate(results, reset ? null : baseline, comparable);
    const report = RunReport.parse({
      schemaVersion: 1,
      id,
      tenantId,
      createdAt,
      variant: degraded ? 'degraded' : 'current',
      suiteVersion: suite.version,
      suiteHash,
      contextHash,
      agent,
      judge: judgeConfiguration,
      baselineId: baseline?.id ?? null,
      accepted: accept && gate.passed,
      baselineReset: reset,
      gate,
      results,
    });
    await withTenant(database, tenantId, (tx) => saveRun(tx, report));
    await Bun.write(
      new URL(
        `../evals/runs/${createdAt.replaceAll(':', '-')}-${tenantId}-${report.variant}.json`,
        import.meta.url,
      ),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(
      `${tenantId}: ${gate.passedCases}/${gate.total}, Arabic ${gate.arabicPassed}/${gate.arabicTotal}; gate ${gate.passed ? 'PASS' : 'BLOCKED'}${report.accepted ? ' — accepted baseline' : ''}`,
    );
    if (!gate.passed) {
      blocked = true;
      console.log(gate.reasons.join('\n'));
    }
  }
} finally {
  await database.close();
}
console.log(
  `Known estimated evaluation cost: USD ${(Number(knownNanoUsd) / 1e9).toFixed(6)}. Failures without usage remain unknown.`,
);
if (blocked) process.exitCode = 1;
