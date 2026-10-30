import { expect, test } from 'bun:test';
import type { QualityService } from '@trustdesk/core';
import { QualityOverview } from '@trustdesk/core/quality/model';
import { createApp } from '../../app.ts';

const request = (path = '') => new Request(`http://localhost/tenants/qamar/quality${path}`);

test('quality routes construct key-free and validate requests before using a database', async () => {
  const app = createApp();
  expect((await app.handle(request())).status).toBe(503);
  expect((await app.handle(request('/attempts/run'))).status).toBe(503);
  expect((await app.handle(new Request('http://localhost/tenants/unknown/quality'))).status).toBe(
    422,
  );
  const spec = await app.handle(new Request('http://localhost/openapi/json'));
  const text = await spec.text();
  expect(text).toContain('getQualityOverview');
  expect(text).toContain('getQualityAttempt');
});

test('quality controller returns saved evidence and hides missing or private database details', async () => {
  const overview = QualityOverview.parse({
    tenantId: 'qamar',
    updatedAt: '2026-10-30T00:00:00Z',
    attemptLimit: 50,
    configuration: {
      model: 'test',
      promptVersion: 'test',
      engineVersion: 'test',
      catalogueVersion: null,
      autoSend: 'low_risk_only',
    },
    trust: { level: 'supervised', promotionAvailable: false },
    summary: {
      total: 0,
      prepared: 0,
      failed: 0,
      running: 0,
      superseded: 0,
      estimatedCostUsd: null,
      unpriced: 0,
      reviews: { approved: 0, rejected: 0, handedOff: 0, edited: 0 },
    },
    attempts: [],
  });
  const service: QualityService = {
    overview: async (tenantId) => (tenantId === 'qamar' ? overview : undefined),
    attempt: async (_tenantId, id) => {
      if (id === 'failure') throw new Error('private SQL and customer data');
      return undefined;
    },
  };
  const app = createApp(undefined, undefined, undefined, service);
  const response = await app.handle(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(overview);
  expect((await app.handle(new Request('http://localhost/tenants/rimal/quality'))).status).toBe(
    404,
  );
  expect((await app.handle(request('/attempts/missing'))).status).toBe(404);
  const unavailable = await app.handle(request('/attempts/failure'));
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain('private SQL');
});
