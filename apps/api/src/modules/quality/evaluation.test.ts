import { expect, test } from 'bun:test';
import type { EvaluationService } from '@trustdesk/core';
import { createApp } from '../../app.ts';

const post = (path: string, body: unknown) =>
  new Request(`http://localhost/tenants/qamar/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const body = {
  caseId: 'q01',
  approverId: 'u_aisha',
  dimensions: { intent_fidelity: 'pass', language: 'pass', helpfulness: 'pass' },
  rationale: 'Independent test fixture',
};

test('evaluation routes construct key-free and reject incomplete human labels and unknown businesses', async () => {
  const app = createApp();
  expect((await app.handle(new Request('http://localhost/tenants/qamar/evaluations'))).status).toBe(
    503,
  );
  expect(
    (await app.handle(new Request('http://localhost/tenants/unknown/evaluations'))).status,
  ).toBe(422);
  expect(
    (
      await app.handle(
        post('evaluations/run/labels', { ...body, dimensions: { language: 'pass' } }),
      )
    ).status,
  ).toBe(422);
  expect(
    (await app.handle(post('trust/promotions', { runId: 'run', reason: 'No named person' })))
      .status,
  ).toBe(422);
  const specification = await (
    await app.handle(new Request('http://localhost/openapi/json'))
  ).text();
  for (const operation of ['getEvaluations', 'getEvaluationRun', 'labelEvaluation', 'promoteTrust'])
    expect(specification).toContain(operation);
});

test('evaluation controller maps saved evidence, conflicts and private infrastructure errors', async () => {
  const service: EvaluationService = {
    overview: async () => undefined,
    run: async () => {
      throw new Error('private database internals');
    },
    label: async () => ({ ok: false, code: 'conflict', message: 'Already labelled.' }),
    promote: async () => ({ ok: false, code: 'conflict', message: 'Calibration required.' }),
  };
  const app = createApp({ evaluation: service });
  expect((await app.handle(new Request('http://localhost/tenants/qamar/evaluations'))).status).toBe(
    404,
  );
  const failed = await app.handle(new Request('http://localhost/tenants/qamar/evaluations/run'));
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain('private database');
  expect((await app.handle(post('evaluations/run/labels', body))).status).toBe(409);
  expect(
    (
      await app.handle(
        post('trust/promotions', { runId: 'run', reason: 'Test', approverId: 'u_aisha' }),
      )
    ).status,
  ).toBe(409);
});
