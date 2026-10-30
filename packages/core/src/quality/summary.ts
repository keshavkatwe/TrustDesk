import type { QualityAttempt, QualitySummary } from './model.ts';

// USD estimates have at most nine decimal places. Keep addition exact, including very small calls.
function costInNanoUsd(value: string | null | undefined) {
  if (!value || !/^\d+(?:\.\d{1,9})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
}

export function summarizeAttempts(attempts: QualityAttempt[]): QualitySummary {
  let nanoUsd = 0n;
  let unpriced = 0;
  const reviews = { approved: 0, rejected: 0, handedOff: 0, edited: 0 };
  for (const attempt of attempts) {
    const cost = costInNanoUsd(attempt.usage?.estimatedCostUsd);
    if (cost === null) unpriced++;
    else nanoUsd += cost;
    if (attempt.review) {
      if (attempt.review.action === 'approve') reviews.approved++;
      if (attempt.review.action === 'reject') reviews.rejected++;
      if (attempt.review.action === 'hand_off') reviews.handedOff++;
      if (attempt.review.edited) reviews.edited++;
    }
  }
  return {
    total: attempts.length,
    prepared: attempts.filter((attempt) => attempt.status === 'succeeded').length,
    failed: attempts.filter((attempt) => attempt.status === 'failed').length,
    running: attempts.filter((attempt) => attempt.status === 'running').length,
    superseded: attempts.filter((attempt) => attempt.status === 'superseded').length,
    estimatedCostUsd:
      attempts.length === unpriced
        ? null
        : `${nanoUsd / 1_000_000_000n}.${(nanoUsd % 1_000_000_000n).toString().padStart(9, '0')}`,
    unpriced,
    reviews,
  };
}
