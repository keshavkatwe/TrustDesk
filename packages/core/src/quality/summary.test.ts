import { expect, test } from 'bun:test';
import { QualityAttempt } from './model.ts';
import { summarizeAttempts } from './summary.ts';

function attempt(id: string, status: QualityAttempt['status'], cost: string | null) {
  return QualityAttempt.parse({
    id,
    status,
    model: 'test',
    promptVersion: 'test',
    errorCode: null,
    responseId: null,
    usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, estimatedCostUsd: cost },
    durationMs: 1,
    createdAt: '2026-10-30T00:00:00Z',
    title: 'Test enquiry',
    sourceEvent: id,
    customer: 'test',
    channel: 'email',
    resultDraftId: null,
    review: null,
  });
}

test('quality summaries retain exact tiny cost estimates and count failures without inventing scores', () => {
  const result = summarizeAttempts([
    attempt('a', 'succeeded', '0.000000001'),
    attempt('b', 'failed', '0.000000009'),
    attempt('c', 'running', null),
    attempt('d', 'superseded', 'invalid'),
  ]);
  expect(result).toMatchObject({
    total: 4,
    prepared: 1,
    failed: 1,
    running: 1,
    superseded: 1,
    estimatedCostUsd: '0.000000010',
    unpriced: 2,
  });
  expect(result).not.toHaveProperty('passRate');
});

test('no priced usage remains unknown, while an explicitly recorded zero remains zero', () => {
  expect(summarizeAttempts([]).estimatedCostUsd).toBeNull();
  expect(summarizeAttempts([attempt('a', 'failed', null)])).toMatchObject({
    estimatedCostUsd: null,
    unpriced: 1,
  });
  expect(summarizeAttempts([attempt('b', 'succeeded', '0.000000000')])).toMatchObject({
    estimatedCostUsd: '0.000000000',
    unpriced: 0,
  });
});
