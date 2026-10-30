import { Elysia } from 'elysia';
import {
  DemoError,
  Inbox,
  InboxItem,
  InboxParams,
  ReviewInput,
  ReviewParams,
  Workspace,
} from './model.ts';
import { createDemoService } from './service.ts';

const reviewErrorStatus = {
  message_not_found: 404,
  invalid_approver: 400,
  stale_draft: 409,
  reason_required: 400,
} as const;

export function createDemoModule() {
  // Allocate fixture state per app, rather than sharing mutable state at import time.
  const demo = createDemoService();
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
      params: InboxParams,
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
        if (!result.ok) return status(reviewErrorStatus[result.code], { message: result.message });
        return result.item;
      },
      {
        params: ReviewParams,
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
