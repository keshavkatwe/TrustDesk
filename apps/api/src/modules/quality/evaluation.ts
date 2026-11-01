import type { EvaluationService } from '@trustdesk/core';
import {
  EvaluationOverview,
  LabelInput,
  PromoteInput,
  RunDetail,
} from '@trustdesk/core/evaluation/model';
import { z } from 'zod';
import { createController } from '../../controller.ts';
import { InboxError, InboxParams, QualityAttemptParams } from './model.ts';

const codes = { not_found: 404, conflict: 409, invalid_request: 422 } as const;
const saved = z.object({ ok: z.literal(true) });
const unavailable = {
  message: 'Evaluation evidence is unavailable. Check the database and try again.',
};
export function createEvaluationModule(service?: EvaluationService) {
  return createController('evaluation', {
    invalid: 'Invalid evaluation request.',
    unavailable: unavailable.message,
  })
    .get(
      '/tenants/:tenantId/evaluations',
      async ({ params, status }) => {
        if (!service) return status(503, unavailable);
        return (
          (await service.overview(params.tenantId)) ??
          status(404, { message: 'Business not found.' })
        );
      },
      {
        params: InboxParams,
        response: { 200: EvaluationOverview, 404: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'getEvaluations',
          tags: ['quality'],
          summary: 'Stored real evaluations, gate outcomes and version-bound trust',
        },
      },
    )
    .get(
      '/tenants/:tenantId/evaluations/:runId',
      async ({ params, status }) => {
        if (!service) return status(503, unavailable);
        return (
          (await service.run(params.tenantId, params.runId)) ??
          status(404, { message: 'Evaluation run not found.' })
        );
      },
      {
        params: QualityAttemptParams,
        response: { 200: RunDetail, 404: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'getEvaluationRun',
          tags: ['quality'],
          summary: 'Inspect saved outputs, code checks, judge rationales and human calibration',
        },
      },
    )
    .post(
      '/tenants/:tenantId/evaluations/:runId/labels',
      async ({ params, body, status }) => {
        if (!service) return status(503, unavailable);
        const result = await service.label(params.tenantId, params.runId, body);
        return result.ok ? result : status(codes[result.code], { message: result.message });
      },
      {
        params: QualityAttemptParams,
        body: LabelInput,
        response: {
          200: saved,
          404: InboxError,
          409: InboxError,
          422: InboxError,
          503: InboxError,
        },
        detail: {
          operationId: 'labelEvaluation',
          tags: ['quality'],
          summary: 'Save one immutable named human evaluation label',
        },
      },
    )
    .post(
      '/tenants/:tenantId/trust/promotions',
      async ({ params, body, status }) => {
        if (!service) return status(503, unavailable);
        const result = await service.promote(params.tenantId, body);
        return result.ok ? result : status(codes[result.code], { message: result.message });
      },
      {
        params: InboxParams,
        body: PromoteInput,
        response: {
          200: saved,
          404: InboxError,
          409: InboxError,
          422: InboxError,
          503: InboxError,
        },
        detail: {
          operationId: 'promoteTrust',
          tags: ['quality'],
          summary:
            'Named promotion guarded by passing current evidence and genuine human calibration',
        },
      },
    );
}
