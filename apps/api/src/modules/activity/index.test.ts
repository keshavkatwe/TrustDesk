import { expect, test } from 'bun:test';
import type { ActivityService } from '@trustdesk/core';
import { createApp } from '../../app.ts';

test('activity contract validates category and business and constructs without services', async () => {
  const app = createApp();
  expect((await app.handle(new Request('http://localhost/tenants/qamar/activity'))).status).toBe(
    503,
  );
  expect(
    (await app.handle(new Request('http://localhost/tenants/qamar/activity?category=secret')))
      .status,
  ).toBe(422);
  expect((await app.handle(new Request('http://localhost/tenants/unknown/activity'))).status).toBe(
    422,
  );
  expect(await (await app.handle(new Request('http://localhost/openapi/json'))).text()).toContain(
    'getActivity',
  );
});
test('activity forwards category, returns saved entries and hides database errors', async () => {
  const service: ActivityService = {
    list: async (tenant, category) => {
      if (tenant === 'rimal') return undefined;
      if (category === 'review') throw new Error('private database data');
      expect(category).toBe('receipt');
      return {
        tenantId: 'qamar',
        updatedAt: '2026-10-30T00:00:00Z',
        limit: 100,
        hasMore: false,
        entries: [],
      };
    },
  };
  const app = createApp({ activity: service });
  expect(
    (await app.handle(new Request('http://localhost/tenants/qamar/activity?category=receipt')))
      .status,
  ).toBe(200);
  expect((await app.handle(new Request('http://localhost/tenants/rimal/activity'))).status).toBe(
    404,
  );
  const failure = await app.handle(
    new Request('http://localhost/tenants/qamar/activity?category=review'),
  );
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain('private database');
});
