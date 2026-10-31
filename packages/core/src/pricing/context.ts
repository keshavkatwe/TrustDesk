import type { TenantTransaction } from '@trustdesk/db';
import { tenants } from '@trustdesk/db';
import { eq } from 'drizzle-orm';
import type { PricingContext } from './evaluate.ts';

export async function loadPricingContext(
  tx: TenantTransaction,
  tenantId: string,
  version: string,
): Promise<PricingContext> {
  // Keep configuration stable until approval/dispatch/draft completion commits.
  await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('share');
  // Keep money columns in top-level queries: pg decodes bigint exactly before any JSON nesting.
  const tenant = await tx.query.tenants.findFirst({
    where: (tenant, { eq }) => eq(tenant.id, tenantId),
  });
  const catalogue = await tx.query.catalogueVersions.findFirst({
    where: (catalogue, { and, eq }) =>
      and(eq(catalogue.tenantId, tenantId), eq(catalogue.version, version)),
  });
  if (!tenant || !catalogue) throw new Error('Business pricing configuration unavailable.');
  const rows = await tx.query.catalogueRows.findMany({
    where: (row, { and, eq }) => and(eq(row.tenantId, tenantId), eq(row.version, version)),
  });
  // Trust remains supervised until persisted evaluation and human promotion are implemented.
  return { tenant, catalogue, rows, trust: 'supervised' };
}
