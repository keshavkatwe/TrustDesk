import { Elysia } from 'elysia';
import { z } from 'zod';
import { DemoError, Inbox, InboxItem, ReviewInput, TenantId, Workspace } from './model.ts';
import { createDemoStore } from './store.ts';

export function demoRoutes() {
  const demo = createDemoStore();
  return new Elysia({ name: 'demo', prefix: '/demo' })
    .onError(({ code, status }) => {
      if (code === 'VALIDATION')
        return status(422, { message: 'Invalid sample request. Check the fields and try again.' });
    })
    .get('/workspace', () => demo.workspace, {
      response: { 200: Workspace },
      detail: {
        operationId: 'getDemoWorkspace',
        tags: ['demo'],
        summary: 'Sample businesses and approvers (no authentication)',
      },
    })
    .get('/tenants/:tenantId/inbox', ({ params }) => demo.inbox(params.tenantId), {
      params: z.object({ tenantId: TenantId }),
      response: { 200: Inbox, 422: DemoError },
      detail: {
        operationId: 'getDemoInbox',
        tags: ['demo'],
        summary: 'Hand-authored inbox scenarios',
      },
    })
    .post(
      '/tenants/:tenantId/inbox/:id/review',
      ({ params, body, status }) => {
        const result = demo.review(params.tenantId, params.id, body);
        if (result.status !== 200) return status(result.status, { message: result.message });
        return result.item;
      },
      {
        params: z.object({ tenantId: TenantId, id: z.string().min(1) }),
        body: ReviewInput,
        response: {
          200: InboxItem,
          400: DemoError,
          404: DemoError,
          409: DemoError,
          422: DemoError,
        },
        detail: {
          operationId: 'reviewDemoDraft',
          tags: ['demo'],
          summary: 'Simulate a review decision in memory; never sends a reply',
        },
      },
    );
}
