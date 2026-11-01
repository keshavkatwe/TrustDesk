import type { TenantTransaction } from '@trustdesk/db';
import { tenants } from '@trustdesk/db';
import { eq } from 'drizzle-orm';
import type { PricingContext } from './evaluate.ts';

export async function loadPricingContext(
  tx: TenantTransaction,
  tenantId: string,
  version?: string,
): Promise<PricingContext> {
  // Keep configuration stable until approval/dispatch/draft completion commits.
  // Return the locked row itself; a second tenant SELECT would repeat the same read.
  // Source money remains top-level so pg decodes bigint without JSON precision loss.
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).for('share');
  const catalogue = await tx.query.catalogueVersions.findFirst({
    where: (catalogue, { and, eq }) =>
      and(
        eq(catalogue.tenantId, tenantId),
        version === undefined ? undefined : eq(catalogue.version, version),
      ),
    orderBy: (catalogue, { desc }) => [desc(catalogue.createdAt), desc(catalogue.version)],
  });
  if (!tenant || !catalogue) throw new Error('Business pricing configuration unavailable.');
  const rows = await tx.query.catalogueRows.findMany({
    where: (row, { and, eq }) =>
      and(eq(row.tenantId, tenantId), eq(row.version, catalogue.version)),
  });
  // Trust remains supervised until persisted evaluation and human promotion are implemented.
  return { tenant, catalogue, rows, trust: 'supervised' };
}
