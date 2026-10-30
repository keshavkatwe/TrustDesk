import { describe, expect, test } from 'bun:test';
import { createApp } from '../../app.ts';
import { fixtures } from './fixtures.ts';
import { DemoError, Inbox, InboxItem } from './model.ts';

function harness() {
  const app = createApp();
  const get = (path: string) => app.handle(new Request(`http://localhost${path}`));
  const review = (tenant = 'qamar', id = 'q-training', overrides = {}) =>
    app.handle(
      new Request(`http://localhost/demo/tenants/${tenant}/inbox/${id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          approverId: 'u_aisha',
          revision: 1,
          action: 'approve',
          reply: 'Reviewed sample reply.',
          reason: '',
          ...overrides,
        }),
      }),
    );
  return { get, review };
}

describe('disposable UI fixture API', () => {
  test('inbox reads are scoped by business and unknown tenants fail validation', async () => {
    const { get } = harness();
    for (const tenant of ['qamar', 'rimal']) {
      const response = await get(`/demo/tenants/${tenant}/inbox`);
      expect(response.status).toBe(200);
      const data = Inbox.parse(await response.json());
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.items.every((item) => item.tenantId === tenant)).toBe(true);
    }
    const invalid = await get('/demo/tenants/unknown/inbox');
    expect(invalid.status).toBe(422);
    expect(DemoError.parse(await invalid.json()).message).toBeString();
  });
  test('cross-business IDs and approvers cannot change a draft', async () => {
    const { review, get } = harness();
    expect((await review('rimal', 'q-training', { approverId: 'u_faisal' })).status).toBe(404);
    expect((await review('qamar', 'q-training', { approverId: 'u_faisal' })).status).toBe(400);
    const data = Inbox.parse(await (await get('/demo/tenants/qamar/inbox')).json());
    expect(data.items.find((item) => item.id === 'q-training')?.status).toBe('needs_approval');
  });
  test('invalid input and empty replies are rejected before a decision', async () => {
    const { review } = harness();
    for (const body of [
      { revision: 0 },
      { reply: '   ' },
      { action: 'send' },
      { reply: 'x'.repeat(4001) },
    ]) {
      const response = await review('qamar', 'q-training', body);
      expect(response.status).toBe(422);
      expect(DemoError.parse(await response.json()).message).toBeString();
    }
  });
  test('superseded and stale revisions reject approval', async () => {
    const { review } = harness();
    expect((await review('qamar', 'q-training-old')).status).toBe(409);
    expect((await review('qamar', 'q-training', { revision: 2 })).status).toBe(409);
  });
  test('simultaneous decisions have one winner and preserve the edit and named reviewer', async () => {
    const { review, get } = harness();
    const responses = await Promise.all([review(), review()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const data = Inbox.parse(await (await get('/demo/tenants/qamar/inbox')).json());
    const item = data.items.find((entry) => entry.id === 'q-training');
    if (!item?.decision) throw new Error('The winning decision was not recorded.');
    expect(item.status).toBe('approved');
    expect(item.revision).toBe(2);
    expect(item.decision.approverName).toBe('Aisha K.');
    expect(item.decision.originalReply).toContain('30 MacBook');
    expect(item.decision.reply).toBe('Reviewed sample reply.');
    expect((await review()).status).toBe(409);
  });
  test('reject and handoff require a reason and use separate terminal states', async () => {
    for (const [action, expected] of [
      ['reject', 'rejected'],
      ['hand_off', 'handed_off'],
    ] as const) {
      const { review } = harness();
      expect((await review('qamar', 'q-training', { action })).status).toBe(400);
      const response = await review('qamar', 'q-training', {
        action,
        reason: 'Needs a person to resolve the scope.',
      });
      expect(response.status).toBe(200);
      expect(InboxItem.parse(await response.json()).status).toBe(expected);
    }
  });
  test('each app instance starts fresh, with no global mutation of fixtures', async () => {
    await harness().review();
    expect((await harness().review()).status).toBe(200);
    expect(fixtures.items.find((item) => item.id === 'q-training')?.status).toBe('needs_approval');
  });
  test('sample quote totals include quantities, periods and VAT consistently', () => {
    for (const item of fixtures.items) {
      if (!item.quote) continue;
      const quote = item.quote;
      for (const line of quote.lines) {
        expect(line.lineTotalMinor).toBe(line.unitPriceMinor * line.quantity * line.periods);
      }
      expect(quote.subtotalMinor).toBe(
        quote.lines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
      );
      expect(quote.vatMinor).toBe(
        Math.round(((quote.subtotalMinor - quote.discountMinor) * quote.vatPercent) / 100),
      );
      expect(quote.totalMinor).toBe(quote.subtotalMinor - quote.discountMinor + quote.vatMinor);
    }
  });
});
