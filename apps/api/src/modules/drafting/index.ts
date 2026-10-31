import type { DraftingService } from '@trustdesk/core';
import { createController } from '../../controller.ts';
import { GenerateInput, GenerateResult, InboxError, ReviewParams } from './model.ts';

const errors = {
  not_found: 404,
  invalid_request: 422,
  conflict: 409,
  unconfigured: 503,
  generation_failed: 502,
} as const;
export function createDraftingModule(service?: DraftingService) {
  return createController('drafting', {
    invalid: 'Invalid drafting request.',
    unavailable: 'Drafting is unavailable. Check the API and database, then try again.',
  }).post(
    '/tenants/:tenantId/inbox/:id/generate',
    async ({ params, body, status }) => {
      if (!service) return status(503, { message: 'AI drafting is not configured.' });
      const result = await service.generate(params.tenantId, params.id, body);
      return result.ok
        ? { id: result.id, runId: result.runId }
        : status(errors[result.code], { message: result.message });
    },
    {
      params: ReviewParams,
      body: GenerateInput,
      response: {
        200: GenerateResult,
        404: InboxError,
        409: InboxError,
        422: InboxError,
        502: InboxError,
        503: InboxError,
      },
      detail: {
        operationId: 'generateDraft',
        tags: ['drafting'],
        summary: 'Prepare a new AI-assisted draft, price in code and hold for named review',
      },
    },
  );
}
