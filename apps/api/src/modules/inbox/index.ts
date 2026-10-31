import type { InboxService } from '@trustdesk/core';
import { createController } from '../../controller.ts';
import {
  Inbox,
  InboxError,
  InboxItem,
  InboxParams,
  ReviewInput,
  ReviewParams,
  Workspace,
} from './model.ts';

const reviewErrorStatus = {
  not_found: 404,
  invalid_request: 422,
  invalid_approver: 400,
  conflict: 409,
  reason_required: 400,
  policy_blocked: 400,
} as const;
const unavailable = {
  message: 'The inbox is unavailable. Check the API and database, then try again.',
};

export function createInboxModule(service?: InboxService) {
  return createController('inbox', {
    invalid: 'Invalid request. Check the fields and try again.',
    unavailable: unavailable.message,
  })
    .get(
      '/workspace',
      async ({ status }) => (service ? service.workspace() : status(503, unavailable)),
      {
        response: { 200: Workspace, 503: InboxError },
        detail: {
          operationId: 'getWorkspace',
          tags: ['inbox'],
          summary: 'Businesses available to the local operator (no production login)',
        },
      },
    )
    .get(
      '/tenants/:tenantId/inbox',
      async ({ params, status }) => {
        if (!service) return status(503, unavailable);
        const inbox = await service.inbox(params.tenantId);
        return inbox ?? status(404, { message: 'Business not found.' });
      },
      {
        params: InboxParams,
        response: { 200: Inbox, 404: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'getInbox',
          tags: ['inbox'],
          summary: 'Persisted messages, sample drafts, reviews and pending outbox entries',
        },
      },
    )
    .post(
      '/tenants/:tenantId/inbox/:id/review',
      async ({ params, body, status }) => {
        if (!service) return status(503, unavailable);
        const result = await service.review(params.tenantId, params.id, body);
        if (!result.ok) return status(reviewErrorStatus[result.code], { message: result.message });
        return result.item;
      },
      {
        params: ReviewParams,
        body: ReviewInput,
        response: {
          200: InboxItem,
          400: InboxError,
          404: InboxError,
          409: InboxError,
          422: InboxError,
          503: InboxError,
        },
        detail: {
          operationId: 'reviewDraft',
          tags: ['inbox'],
          summary:
            'Save a named review and edit diff; approval atomically creates a pending outbox entry',
        },
      },
    );
}
