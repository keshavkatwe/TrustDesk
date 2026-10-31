import { type Database, withTenant } from '@trustdesk/db';
import { ACTIVITY_LIMIT, Activity, type ActivityCategory } from './model.ts';
import { readActivityEntries } from './sources.ts';

export function createActivityService(database: Database, allowedTenantIds: readonly string[]) {
  const allowed = new Set(allowedTenantIds);
  return {
    async list(tenantId: string, category?: ActivityCategory) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const tenant = await tx.query.tenants.findFirst({
          columns: { id: true },
          where: (t, { eq }) => eq(t.id, tenantId),
        });
        if (!tenant) return undefined;
        const entries = await readActivityEntries(tx, tenantId, category);
        entries.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
        return Activity.parse({
          tenantId,
          updatedAt: new Date().toISOString(),
          limit: ACTIVITY_LIMIT,
          hasMore: entries.length > ACTIVITY_LIMIT,
          entries: entries.slice(0, ACTIVITY_LIMIT),
        });
      });
    },
  };
}
export type ActivityService = ReturnType<typeof createActivityService>;
