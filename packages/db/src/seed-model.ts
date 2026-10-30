import { z } from 'zod';

const Money = z.number().nonnegative().max(1_000_000_000);
export const SourceTenants = z
  .strictObject({
    tenants: z
      .array(
        z.strictObject({
          id: z.enum(['qamar', 'rimal']),
          name: z.string().min(1),
          location: z.string().min(1),
          sells: z.string().min(1),
          currency: z.enum(['AED', 'SAR']),
          currency_minor_units: z.literal(2),
          vat_rate: z.number().min(0).max(1),
          languages: z.array(z.enum(['en', 'ar'])).min(1),
          channels: z
            .array(
              z.strictObject({
                channel: z.enum(['whatsapp', 'email', 'webform']),
                address: z.string().min(1),
              }),
            )
            .min(1),
          auto_send: z.enum(['low_risk_only', 'off']),
          approvers: z
            .array(
              z.strictObject({
                id: z.string().min(1),
                name: z.string().min(1),
                role: z.string().min(1),
              }),
            )
            .min(1),
          policy: z.strictObject({
            discount_needs_approval_at_pct: z.number().min(0).max(100),
            service_area: z.array(z.string().min(1)).min(1),
            outside_service_area: z.literal('hand_off'),
            minimum_order_before_vat: Money.optional(),
          }),
          faq: z.array(z.string().min(1)),
        }),
      )
      .length(2),
  })
  .refine(
    ({ tenants }) => new Set(tenants.map((tenant) => tenant.id)).size === tenants.length,
    'Tenant IDs must be unique.',
  );

export const SourceCatalogue = z
  .strictObject({
    tenant: z.enum(['qamar', 'rimal']),
    version: z.iso.date(),
    currency: z.enum(['AED', 'SAR']),
    prices_exclude_vat: z.literal(true),
    rows: z
      .array(
        z
          .strictObject({
            id: z.string().min(1),
            item: z.string().min(1),
            item_ar: z.string().min(1).optional(),
            rent_per_month: Money.optional(),
            buy: Money.optional(),
            per_day: Money.optional(),
            per_shift: Money.optional(),
            flat: Money.optional(),
          })
          .refine((row) => {
            const productRates = [row.rent_per_month, row.buy].filter(
              (rate) => rate !== undefined,
            ).length;
            const serviceRates = [row.per_day, row.per_shift, row.flat].filter(
              (rate) => rate !== undefined,
            ).length;
            return (
              (productRates > 0 && serviceRates === 0) || (productRates === 0 && serviceRates === 1)
            );
          }, 'A row needs monthly/purchase prices or exactly one daily/shift/flat rate.'),
      )
      .min(1),
  })
  .refine(
    ({ rows }) => new Set(rows.map((row) => row.id)).size === rows.length,
    'Catalogue row IDs must be unique within a version.',
  );

// Convert source decimals by digits, without floating-point multiplication or silent rounding.
export function scaledInteger(value: number, places: number): bigint {
  const [whole, fraction = ''] = value.toString().split('.');
  if (!whole || !/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > places)
    throw new Error(`Source value must be nonnegative with at most ${places} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
