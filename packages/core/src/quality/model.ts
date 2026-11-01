import { z } from 'zod';
import { Generation } from '../ai/model.ts';
import { ReviewAction, TenantId } from '../inbox/model.ts';
import { Assessment } from '../pricing/model.ts';

export const QUALITY_ATTEMPT_LIMIT = 50;
const Count = z.number().int().nonnegative();
export const QualityReview = z.object({
  action: ReviewAction,
  reviewer: z.string(),
  at: z.iso.datetime({ offset: true }),
  edited: z.boolean(),
});
export const QualityAttempt = Generation.extend({
  title: z.string(),
  sourceEvent: z.string(),
  customer: z.string(),
  channel: z.enum(['whatsapp', 'email', 'webform']),
  resultDraftId: z.string().nullable(),
  review: QualityReview.nullable(),
});
export const QualitySummary = z.object({
  total: Count,
  prepared: Count,
  failed: Count,
  running: Count,
  superseded: Count,
  estimatedCostUsd: z.string().nullable(),
  unpriced: Count,
  reviews: z.object({ approved: Count, rejected: Count, handedOff: Count, edited: Count }),
});
export const QualityOverview = z.object({
  tenantId: TenantId,
  updatedAt: z.iso.datetime({ offset: true }),
  attemptLimit: z.literal(QUALITY_ATTEMPT_LIMIT),
  configuration: z.object({
    model: z.string(),
    promptVersion: z.string(),
    engineVersion: z.string(),
    catalogueVersion: z.string().nullable(),
    autoSend: z.enum(['low_risk_only', 'off']),
  }),
  trust: z.object({
    level: z.enum(['supervised', 'autonomous']),
  }),
  summary: QualitySummary,
  attempts: z.array(QualityAttempt).max(QUALITY_ATTEMPT_LIMIT),
});
export const QualityAttemptDetail = QualityAttempt.extend({
  sourceDraftId: z.string(),
  body: z.string(),
  reply: z.string().nullable(),
  assessment: Assessment.nullable(),
  inputHash: z.string(),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type QualityAttempt = z.infer<typeof QualityAttempt>;
export type QualitySummary = z.infer<typeof QualitySummary>;
export type QualityOverview = z.infer<typeof QualityOverview>;
export type QualityAttemptDetail = z.infer<typeof QualityAttemptDetail>;
