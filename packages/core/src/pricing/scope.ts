import type { PricingContext } from './types.ts';

export function assertPricingScope(context: PricingContext) {
  if (
    context.catalogue.tenantId !== context.tenant.id ||
    context.rows.some(
      (row) => row.tenantId !== context.tenant.id || row.version !== context.catalogue.version,
    )
  )
    throw new Error('Catalogue context must belong to exactly one business and version.');
}
