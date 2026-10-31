import { expect, test } from 'bun:test';
import type { ReceiveService } from '@trustdesk/core';
import { createApp } from '../../app.ts';

const event = {
  event_id: 'test',
  channel: 'webform',
  to: 'web:qamar',
  from: 'demo:test',
  message_id: 'm1',
  received_at: '2026-10-30T00:00:00Z',
  text: 'Two phones please',
};
const req = (body: unknown) =>
  new Request('http://localhost/local/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
test('local receiving contract is key-free and validates before invoking the adapter', async () => {
  expect((await createApp().handle(req(event))).status).toBe(503);
  expect((await createApp().handle(req({ ...event, text: '' }))).status).toBe(422);
  const service: ReceiveService = {
    receive: async () => ({
      ok: true,
      tenantId: 'qamar',
      receiptId: 'r1',
      messageId: 'm1',
      draftId: 'd1',
      outcome: 'accepted',
    }),
  };
  expect((await createApp({ receive: service }).handle(req(event))).status).toBe(202);
});
