import { z } from 'zod';
import { TenantId } from '../inbox/model.ts';

const Percent = z
  .string()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) <= 100);
const Months = z.number().int().min(1).max(1200).nullable();
export const BusinessRules = z
  .strictObject({
    vatPercent: Percent,
    discountApprovalPercent: Percent,
    minimumOrder: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
    serviceAreas: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    faq: z.array(z.string().trim().min(1).max(1000)).max(30),
    autoSend: z.enum(['low_risk_only', 'off']),
    minimumRentalMonths: Months,
    maximumRentalMonths: Months,
    deliveryBasis: z.enum(['order', 'trip']),
    stageThresholdM2: z.number().int().min(1).max(10000).nullable(),
    screenThresholdM2: z.number().int().min(1).max(10000).nullable(),
    crewShiftsPerOrder: z.number().int().min(1).max(100).nullable(),
  })
  .refine(
    (rules) =>
      rules.minimumRentalMonths === null ||
      rules.maximumRentalMonths === null ||
      rules.minimumRentalMonths <= rules.maximumRentalMonths,
    {
      message: 'Minimum rental duration must not exceed the maximum.',
      path: ['maximumRentalMonths'],
    },
  )
  .refine(
    (rules) =>
      new Set(rules.serviceAreas.map((area) => area.toLocaleLowerCase('en'))).size ===
      rules.serviceAreas.length,
    { message: 'Service areas must be unique.', path: ['serviceAreas'] },
  );
export const UpdateSettings = z.strictObject({
  version: z.string().regex(/^[a-f0-9]{64}$/),
  approverId: z.string().min(1).max(200),
  reason: z.string().trim().min(1).max(1000),
  rules: BusinessRules,
});
export const Settings = z.object({
  tenantId: TenantId,
  version: z.string(),
  rules: BusinessRules,
  business: z.object({
    name: z.string(),
    sells: z.string(),
    location: z.string(),
    timezone: z.string(),
    currency: z.enum(['AED', 'SAR']),
    languages: z.array(z.string()),
  }),
  approvers: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })),
  channels: z.array(
    z.object({ channel: z.enum(['whatsapp', 'email', 'webform']), address: z.string() }),
  ),
  commercial: z.object({
    version: z.string(),
    deliverySku: z.string(),
    crewSku: z.string().nullable(),
    stageDeckAreaM2: z.number().nullable(),
    locationAliases: z.record(z.string(), z.string()),
  }),
  ai: z.object({
    model: z.string(),
    promptVersion: z.string(),
    engineVersion: z.string(),
    providerConfigured: z.boolean(),
    trust: z.enum(['supervised', 'autonomous']),
    delivery: z.literal('simulated'),
  }),
});
export type BusinessRules = z.infer<typeof BusinessRules>;
export type UpdateSettings = z.infer<typeof UpdateSettings>;
export type Settings = z.infer<typeof Settings>;
