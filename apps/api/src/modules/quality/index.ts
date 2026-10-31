import type { QualityService } from '@trustdesk/core';
import { createController } from '../../controller.ts';
import {
  InboxError,
  InboxParams,
  QualityAttemptDetail,
  QualityAttemptParams,
  QualityOverview,
} from './model.ts';

const unavailable = {
  message: 'Quality evidence is unavailable. Check the API and database, then try again.',
};

export function createQualityModule(service?: QualityService) {
  return createController('quality', {
    invalid: 'Invalid quality request.',
    unavailable: unavailable.message,
  })
    .get(
      '/tenants/:tenantId/quality',
      async ({ params, status }) => {
        if (!service) return status(503, unavailable);
        return (
          (await service.overview(params.tenantId)) ??
          status(404, { message: 'Business not found.' })
        );
      },
      {
        params: InboxParams,
        response: { 200: QualityOverview, 404: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'getQualityOverview',
          tags: ['quality'],
          summary: 'Recent tenant-owned AI evidence and supervised trust readiness',
        },
      },
    )
    .get(
      '/tenants/:tenantId/quality/attempts/:runId',
      async ({ params, status }) => {
        if (!service) return status(503, unavailable);
        return (
          (await service.attempt(params.tenantId, params.runId)) ??
          status(404, { message: 'AI attempt not found in this business.' })
        );
      },
      {
        params: QualityAttemptParams,
        response: { 200: QualityAttemptDetail, 404: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'getQualityAttempt',
          tags: ['quality'],
          summary: 'Inspect one saved AI attempt without calling the model',
        },
      },
    );
}
