import { z } from 'zod';

// Transcribed source FAQ rules and explicitly documented operational assumptions.
export const CommercialRules = z.strictObject({
  version: z.string().min(1),
  minimumRentalMonths: z.number().int().positive().nullable(),
  maximumRentalMonths: z.number().int().positive().nullable(),
  locationAliases: z.record(z.string(), z.string()),
  delivery: z.strictObject({ sku: z.string().min(1), basis: z.enum(['order', 'trip']) }),
  crew: z
    .strictObject({
      sku: z.string().min(1),
      stageSku: z.string().min(1),
      stageDeckAreaM2: z.number().int().positive(),
      stageThresholdM2: z.number().int().positive(),
      screenSku: z.string().min(1),
      screenThresholdM2: z.number().int().positive(),
      tentSku: z.string().min(1),
      shiftsPerOrder: z.number().int().positive(),
    })
    .nullable(),
});
export type CommercialRules = z.infer<typeof CommercialRules>;
