import { z } from 'zod';
import { TenantId } from '../inbox/model.ts';

export const ACTIVITY_LIMIT = 100;
export const ActivityCategory = z.enum([
  'receipt',
  'draft',
  'ai',
  'review',
  'delivery',
  'settings',
]);
export const ActivityQuery = z.object({ category: ActivityCategory.optional() });
export const ActivityEntry = z.object({
  id: z.string(),
  category: ActivityCategory,
  at: z.iso.datetime({ offset: true }),
  title: z.string(),
  description: z.string(),
  actor: z.string(),
  outcome: z.string(),
  reference: z.string(),
  details: z.array(
    z.object({ label: z.string(), value: z.string(), format: z.literal('timestamp').optional() }),
  ),
});
export const Activity = z.object({
  tenantId: TenantId,
  updatedAt: z.iso.datetime({ offset: true }),
  limit: z.literal(ACTIVITY_LIMIT),
  hasMore: z.boolean(),
  entries: z.array(ActivityEntry).max(ACTIVITY_LIMIT),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;
export type ActivityCategory = z.infer<typeof ActivityCategory>;
