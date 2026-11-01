import { type CaseResult, DIMENSIONS, type RunReport } from './model.ts';

export const PASS_THRESHOLD = 0.95;
export const MIN_HUMAN_LABELS_PER_TENANT = 5;
export function casePassed(result: CaseResult) {
  return (
    !result.error &&
    result.checks.every((check) => check.pass) &&
    result.judge !== null &&
    DIMENSIONS.every((key) => result.judge?.[key].grade === 'pass')
  );
}
export function regressionGate(
  results: CaseResult[],
  baseline: RunReport | null,
  comparable: boolean,
) {
  const passedCases = results.filter(casePassed).length;
  const arabic = results.filter((result) => result.case.language !== 'English');
  const arabicPassed = arabic.filter(casePassed).length;
  const hardFailures = results.reduce(
    (total, result) => total + result.checks.filter((check) => check.hard && !check.pass).length,
    0,
  );
  const regressions =
    baseline?.results
      .filter(casePassed)
      .filter(
        (previous) =>
          !results.some((current) => current.case.id === previous.case.id && casePassed(current)),
      )
      .map((result) => result.case.id) ?? [];
  const reasons: string[] = [];
  if (!results.length) reasons.push('No cases completed.');
  if (hardFailures) reasons.push(`${hardFailures} hard check failures.`);
  if (passedCases / results.length < PASS_THRESHOLD)
    reasons.push('Overall pass rate is below 95%. Unassessable and failed judges are not passes.');
  if (!arabic.length || arabicPassed / arabic.length < PASS_THRESHOLD)
    reasons.push('Arabic / mixed / Arabizi pass rate is below 95% or missing.');
  if (baseline && !comparable)
    reasons.push(
      'Goldset, judge or business configuration differs from the accepted baseline; establish a reviewed new baseline.',
    );
  if (regressions.length) reasons.push(`${regressions.length} previously passing cases regressed.`);
  return {
    passed: reasons.length === 0,
    reasons,
    passedCases,
    total: results.length,
    passRate: results.length ? passedCases / results.length : 0,
    arabicPassed,
    arabicTotal: arabic.length,
    hardFailures,
    regressions,
  };
}

export function calibration(
  results: CaseResult[],
  labels: { caseId: string; dimensions: Record<(typeof DIMENSIONS)[number], string> }[],
) {
  let comparisons = 0,
    agreements = 0;
  const disagreements: string[] = [];
  for (const label of labels) {
    const result = results.find((result) => result.case.id === label.caseId);
    if (!result?.judge) continue;
    for (const dimension of DIMENSIONS) {
      comparisons++;
      if (label.dimensions[dimension] === result.judge[dimension].grade) agreements++;
      else
        disagreements.push(
          `${label.caseId}: ${dimension} (human ${label.dimensions[dimension]}, judge ${result.judge[dimension].grade})`,
        );
    }
  }
  const assessed = labels.every((label) =>
    DIMENSIONS.every((key) => label.dimensions[key] !== 'not_assessable'),
  );
  return {
    labels: labels.length,
    comparisons,
    agreements,
    disagreements,
    ready:
      labels.length >= MIN_HUMAN_LABELS_PER_TENANT &&
      assessed &&
      comparisons === labels.length * DIMENSIONS.length &&
      agreements / comparisons >= 0.9 &&
      !labels.some((label) => DIMENSIONS.some((key) => label.dimensions[key] === 'fail')),
  };
}
