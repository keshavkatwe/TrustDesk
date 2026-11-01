import { expect, test } from 'bun:test';
import { agentVersion, sameConfiguration } from '../ai/version.ts';
import { calibration, regressionGate } from './gate.ts';
import { CaseResult, DIMENSIONS, type RunReport } from './model.ts';

const dimension = { grade: 'pass', rationale: 'Synthetic test fixture, not measured evidence.' };
function result(id: string) {
  return CaseResult.parse({
    case: {
      id,
      tenantId: 'qamar',
      category: 'normal',
      language: 'Arabic',
      messages: ['اختبار'],
      expected: {},
      guidance: 'Test only',
    },
    output: null,
    assessment: null,
    reply: 'اختبار',
    checks: [{ name: 'safe', pass: true, hard: true, detail: 'test' }],
    judge: { intent_fidelity: dimension, language: dimension, helpfulness: dimension },
    error: null,
    generation: { responseId: 'test-only', model: 'test-only', durationMs: 1, usage: null },
    judging: {
      responseId: 'test-only',
      model: 'test-only',
      durationMs: 1,
      usage: null,
      error: null,
    },
  });
}

test('a hard violation blocks a high pass rate and identifies previously passing regressions', () => {
  const previous = Array.from({ length: 30 }, (_, i) => result(`case-${i}`));
  const candidate = structuredClone(previous);
  candidate[0]?.checks.push({ name: 'foreign_catalogue', pass: false, hard: true, detail: 'test' });
  const gate = regressionGate(candidate, { results: previous } as RunReport, true);
  expect(gate.passRate).toBeGreaterThan(0.95);
  expect(gate.passed).toBe(false);
  expect(gate.hardFailures).toBe(1);
  expect(gate.regressions).toEqual(['case-0']);
});

test('judge abstention, missing Arabic coverage and incomparable evidence fail closed', () => {
  const abstained = result('a');
  if (abstained.judge) abstained.judge.language.grade = 'not_assessable';
  expect(regressionGate([abstained], null, true).passed).toBe(false);
  const english = result('english');
  english.case.language = 'English';
  expect(regressionGate([english], null, true).passed).toBe(false);
  expect(regressionGate([result('a')], { results: [result('a')] } as RunReport, false).passed).toBe(
    false,
  );
});

test('human calibration counts actual dimension agreement and never treats absence as success', () => {
  expect(calibration([result('a')], []).ready).toBe(false);
  const outputs = Array.from({ length: 5 }, (_, i) => result(`${i}`));
  const labels = outputs.map((output) => ({
    caseId: output.case.id,
    dimensions: { intent_fidelity: 'pass', language: 'pass', helpfulness: 'pass' },
  }));
  expect(calibration(outputs, labels)).toMatchObject({
    comparisons: 15,
    agreements: 15,
    ready: true,
  });
  const label = labels[0];
  if (label) label.dimensions.language = 'fail';
  expect(calibration(outputs, labels)).toMatchObject({
    comparisons: 15,
    agreements: 14,
    ready: false,
  });
  expect(calibration(outputs, labels).disagreements).toHaveLength(1);
  expect(DIMENSIONS).toHaveLength(3);
});

test('agent identity changes with prompt, model or structured schema configuration', () => {
  const current = agentVersion('model-a');
  expect(current.id).not.toBe(agentVersion('model-b').id);
  expect(current.id).not.toBe(agentVersion('model-a', 'Different instructions').id);
  expect(current.promptHash).toHaveLength(64);
});

test('JSONB object key ordering cannot create a false judge/configuration regression', () => {
  expect(
    sameConfiguration(
      {
        model: 'pinned',
        parameters: { store: false, reasoning: { effort: 'medium' }, max_output_tokens: 3000 },
      },
      {
        parameters: { max_output_tokens: 3000, reasoning: { effort: 'medium' }, store: false },
        model: 'pinned',
      },
    ),
  ).toBe(true);
  expect(
    sameConfiguration(
      { parameters: { reasoning: { effort: 'low' } } },
      { parameters: { reasoning: { effort: 'medium' } } },
    ),
  ).toBe(false);
});
