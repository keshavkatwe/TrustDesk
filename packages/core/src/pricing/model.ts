import { z } from 'zod';
import { Percent, Quantity } from './decimal.ts';

export const Money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const Quote = z.object({
  currency: z.enum(['AED', 'SAR']),
  vatPercent: z.number(),
  lines: z.array(
    z.object({
      sku: z.string(),
      label: z.string(),
      unitPriceMinor: Money,
      quantity: z.number().positive(),
      periods: z.number().positive(),
      unit: z.string(),
      lineTotalMinor: Money,
    }),
  ),
  subtotalMinor: Money,
  discountMinor: Money,
  vatMinor: Money,
  totalMinor: Money,
  complete: z.boolean(),
  note: z.string(),
});
export const Reason = z.object({
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  source: z.string(),
});
export const PricingRequest = z.strictObject({
  intent: z.enum(['quote', 'faq', 'support', 'spam']),
  language: z.enum(['Arabic', 'English', 'Mixed']),
  lines: z
    .array(
      z.strictObject({
        sku: z.string().min(1).nullable(),
        description: z.string().min(1).max(200),
        quantity: Quantity.nullable(),
        unit: z.enum(['item', 'm2']),
        mode: z.enum(['buy', 'month', 'day']),
        periods: Quantity.nullable(),
      }),
    )
    .max(30),
  location: z.string().max(100).nullable(),
  requestedDate: z.string().max(200).nullable().default(null),
  notes: z.string().max(1000).nullable().default(null),
  delivery: z.enum(['requested', 'collection', 'unknown']),
  deliveryTrips: z.number().int().min(1).max(100).nullable(),
  discountRequested: z.boolean(),
  discountPercent: Percent.nullable(),
  budgetMinor: Money.nullable(),
  availabilityRequested: z.boolean(),
  faqIndex: z.number().int().nonnegative().nullable(),
  missing: z.array(z.string().max(200)).max(30),
});
export const Assessment = z.object({
  engineVersion: z.string(),
  catalogueVersion: z.string(),
  fingerprint: z.string(),
  request: PricingRequest,
  disposition: z.enum(['auto_send', 'needs_approval', 'hand_off', 'drop']),
  blockApproval: z.boolean(),
  quote: Quote.nullable(),
  reasons: z.array(Reason),
  missing: z.array(z.string()),
});
export type PricingRequest = z.infer<typeof PricingRequest>;
export type Assessment = z.infer<typeof Assessment>;
export type Quote = z.infer<typeof Quote>;
