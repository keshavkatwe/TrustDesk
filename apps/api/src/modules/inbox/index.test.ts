import { expect, test } from 'bun:test';
import type { InboxService } from '@trustdesk/core';
import { createApp } from '../../app.ts';

const reviewRequest = (body: unknown) =>
  new Request('http://localhost/tenants/qamar/inbox/example/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const input = { approverId: 'u_aisha', revision: 1, action: 'approve', reply: 'Hello', reason: '' };

test('app and OpenAPI construct without a database; inbox fails closed when unconfigured', async () => {
  const app = createApp();
  expect((await app.handle(new Request('http://localhost/healthz'))).status).toBe(200);
  const spec = await app.handle(new Request('http://localhost/openapi/json'));
  expect(spec.status).toBe(200);
  expect(JSON.stringify(await spec.json())).toContain('reviewDraft');
  expect((await app.handle(new Request('http://localhost/workspace'))).status).toBe(503);
  expect((await app.handle(reviewRequest({ ...input, reply: '' }))).status).toBe(422);
});

test('controller maps a stale draft to 409 and hides database exception details', async () => {
  const service: InboxService = {
    workspace: async () => {
      throw new Error('private SQL and customer data');
    },
    inbox: async () => undefined,
    review: async () => ({ ok: false, code: 'conflict', message: 'Refresh this draft.' }),
  };
  const app = createApp({ inbox: service });
  const conflict = await app.handle(reviewRequest(input));
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toEqual({ message: 'Refresh this draft.' });
  const unavailable = await app.handle(new Request('http://localhost/workspace'));
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain('private SQL');
  expect((await app.handle(new Request('http://localhost/tenants/qamar/inbox'))).status).toBe(404);
});
