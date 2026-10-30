import { expect, test } from 'bun:test';
import type { DraftingService } from '@trustdesk/core';
import { createApp } from '../../app.ts';

const request = (body: unknown = { revision: 1 }) =>
  new Request('http://localhost/tenants/qamar/inbox/example/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
test('drafting contract is key-free, validates inputs and exposes a stable operation', async () => {
  const app = createApp();
  expect((await app.handle(request())).status).toBe(503);
  expect((await app.handle(request({ revision: 0 }))).status).toBe(422);
  expect(
    JSON.stringify(await (await app.handle(new Request('http://localhost/openapi/json'))).json()),
  ).toContain('generateDraft');
});
test('drafting controller maps conflicts and provider failures without exposing exceptions', async () => {
  for (const [code, expected] of [
    ['conflict', 409],
    ['generation_failed', 502],
    ['not_found', 404],
  ] as const) {
    const service: DraftingService = {
      generate: async () => ({ ok: false, code, message: 'Safe failure' }),
    };
    expect((await createApp(undefined, service).handle(request())).status).toBe(expected);
  }
  const service: DraftingService = {
    generate: async () => {
      throw new Error('Private prompt and key');
    },
  };
  const response = await createApp(undefined, service).handle(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('Private');
});
