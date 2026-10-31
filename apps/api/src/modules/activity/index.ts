import type { ActivityService } from '@trustdesk/core';
import { Elysia } from 'elysia';
import { Activity, ActivityQuery, InboxError, InboxParams } from './model.ts';

export function createActivityModule(service?: ActivityService) {
  const unavailable = {
    message: 'Activity is unavailable. Check the API and database, then try again.',
  };
  return new Elysia({ name: 'activity' })
    .onError(({ code, status }) =>
      status(
        code === 'VALIDATION' ? 422 : 503,
        code === 'VALIDATION' ? { message: 'Invalid activity request.' } : unavailable,
      ),
    )
    .get(
      '/tenants/:tenantId/activity',
      async ({ params, query, status }) => {
        if (!service) return status(503, unavailable);
        return (
          (await service.list(params.tenantId, query.category)) ??
          status(404, { message: 'Business not found.' })
        );
      },
      {
        params: InboxParams,
        query: ActivityQuery,
        response: { 200: Activity, 404: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'getActivity',
          tags: ['activity'],
          summary: 'Latest saved business activity, optionally filtered by category',
        },
      },
    );
}
