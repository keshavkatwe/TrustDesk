import { randomUUID } from 'node:crypto';
import {
  CommercialRules,
  type Database,
  settingsChanges,
  tenants,
  withTenant,
} from '@trustdesk/db';
import { eq } from 'drizzle-orm';
import { DEFAULT_MODEL, PROMPT_VERSION } from '../ai/model.ts';
import { ENGINE_VERSION } from '../pricing/evaluate.ts';
import { type Failure, failure } from '../result.ts';
import { Settings, UpdateSettings } from './model.ts';
import {
  normalizeRules,
  rulesFromTenant,
  rulesPatch,
  settingsVersion,
  validateRules,
} from './rules.ts';

export { rulesFromTenant } from './rules.ts';

type SettingsResult =
  | { ok: true; changed: boolean }
  | Failure<'not_found' | 'invalid' | 'conflict'>;

export function createSettingsService(
  database: Database,
  allowedTenantIds: readonly string[],
  model = DEFAULT_MODEL,
  providerConfigured = false,
) {
  const allowed = new Set(allowedTenantIds);
  return {
    async get(tenantId: string): Promise<Settings | undefined> {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        // Top-level money decoding preserves bigint precision.
        const tenant = await tx.query.tenants.findFirst({
          where: (t, { eq }) => eq(t.id, tenantId),
          with: { approvers: true, receivingChannels: true },
        });
        if (!tenant) return undefined;
        const commercial = CommercialRules.parse(tenant.commercialRules);
        return Settings.parse({
          tenantId,
          version: settingsVersion(tenant),
          rules: rulesFromTenant(tenant),
          business: tenant,
          approvers: tenant.approvers,
          channels: tenant.receivingChannels,
          commercial: {
            version: commercial.version,
            deliverySku: commercial.delivery.sku,
            crewSku: commercial.crew?.sku ?? null,
            stageDeckAreaM2: commercial.crew?.stageDeckAreaM2 ?? null,
            locationAliases: commercial.locationAliases,
          },
          ai: {
            model,
            promptVersion: PROMPT_VERSION,
            engineVersion: ENGINE_VERSION,
            providerConfigured,
            trust: 'supervised',
            delivery: 'simulated',
          },
        });
      });
    },
    async update(tenantId: string, raw: unknown): Promise<SettingsResult> {
      if (!allowed.has(tenantId)) return failure('not_found', 'Business not found.');
      const input = UpdateSettings.safeParse(raw);
      if (!input.success)
        return failure('invalid', 'Check the rule values and rental duration range.');
      return withTenant(database, tenantId, async (tx) => {
        // Serializes configuration changes with pricing's shared row lock.
        const [tenant] = await tx
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .for('update');
        if (!tenant) return failure('not_found', 'Business not found.');
        if (settingsVersion(tenant) !== input.data.version)
          return failure(
            'conflict',
            'Settings changed since you opened this form. Reload the current settings before saving.',
          );
        const approver = await tx.query.approvers.findFirst({
          where: (p, { and, eq }) => and(eq(p.tenantId, tenantId), eq(p.id, input.data.approverId)),
        });
        if (!approver) return failure('invalid', 'Choose a named approver from this business.');
        const { reason } = input.data;
        const rules = normalizeRules(input.data.rules);
        const rejection = validateRules(tenant, rules);
        if (rejection) return rejection;
        const before = rulesFromTenant(tenant);
        // A save of unchanged values creates neither a revision nor an audit entry.
        if (JSON.stringify(before) === JSON.stringify(rules))
          return { ok: true, changed: false } as const;
        const id = randomUUID();
        await tx
          .update(tenants)
          .set(rulesPatch(tenant, rules, id))
          .where(eq(tenants.id, tenantId));
        await tx.insert(settingsChanges).values({
          tenantId,
          id,
          approverId: approver.id,
          approverName: approver.name,
          reason,
          before,
          after: rules,
        });
        return { ok: true, changed: true } as const;
      });
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
