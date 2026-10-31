import { expect, test } from 'bun:test';
import type { SettingsService } from '@trustdesk/core';
import { BusinessRules } from '@trustdesk/core/settings/model';
import { createApp } from '../../app.ts';

const rules = {
  vatPercent: '5.00',
  discountApprovalPercent: '10.00',
  minimumOrder: '0.00',
  serviceAreas: ['Dubai'],
  faq: [],
  autoSend: 'off',
  minimumRentalMonths: 1,
  maximumRentalMonths: 12,
  deliveryBasis: 'order',
  stageThresholdM2: null,
  screenThresholdM2: null,
  crewShiftsPerOrder: null,
};
const body = { version: 'a'.repeat(64), approverId: 'u_aisha', reason: 'Policy update', rules };
function request(data: unknown = body) {
  return new Request('http://localhost/tenants/qamar/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}
test('settings reject malformed rules, reversed limits and secret or identity fields', async () => {
  const app = createApp();
  expect((await app.handle(request())).status).toBe(503);
  for (const invalid of [
    { ...body, rules: { ...rules, vatPercent: '101' } },
    { ...body, rules: { ...rules, minimumOrder: '-1' } },
    { ...body, rules: { ...rules, minimumRentalMonths: 24 } },
    { ...body, apiKey: 'private' },
    { ...body, rules: { ...rules, name: 'another' } },
  ])
    expect((await app.handle(request(invalid))).status).toBe(422);
  expect(BusinessRules.safeParse({ ...rules, serviceAreas: ['Dubai', 'dubai'] }).success).toBe(
    false,
  );
});
test('settings map stale saves, invalid approvers and missing businesses without leaking exceptions', async () => {
  for (const [code, status] of [
    ['conflict', 409],
    ['invalid', 422],
    ['not_found', 404],
  ] as const) {
    const service: SettingsService = {
      get: async () => undefined,
      update: async () => ({ ok: false, code, message: 'Settings unavailable' }),
    };
    const app = createApp({ settings: service });
    expect((await app.handle(request())).status).toBe(status);
    expect((await app.handle(new Request('http://localhost/tenants/qamar/settings'))).status).toBe(
      404,
    );
  }
  const service: SettingsService = {
    get: async () => {
      throw new Error('private SQL');
    },
    update: async () => ({ ok: true, changed: true }),
  };
  const app = createApp({ settings: service });
  expect(await (await app.handle(request())).json()).toEqual({ changed: true });
  const failure = await app.handle(new Request('http://localhost/tenants/qamar/settings'));
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain('private SQL');
});
