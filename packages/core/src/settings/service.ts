import { createHash, randomUUID } from 'node:crypto';
import {
  CommercialRules,
  type Database,
  settingsChanges,
  tenants,
  withTenant,
} from '@trustdesk/db';
import { eq } from 'drizzle-orm';
import { DEFAULT_MODEL, PROMPT_VERSION } from '../ai/model.ts';
import { formatMinor } from '../pricing/decimal.ts';
import { ENGINE_VERSION } from '../pricing/evaluate.ts';
import { type BusinessRules, Settings, UpdateSettings } from './model.ts';

type SettingsResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: 'not_found' | 'invalid' | 'conflict'; message: string };

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
      if (!allowed.has(tenantId))
        return { ok: false, code: 'not_found', message: 'Business not found.' } as const;
      const input = UpdateSettings.safeParse(raw);
      if (!input.success)
        return {
          ok: false,
          code: 'invalid',
          message: 'Check the rule values and rental duration range.',
        } as const;
      return withTenant(database, tenantId, async (tx) => {
        // Serializes configuration changes with pricing's shared row lock.
        const [tenant] = await tx
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .for('update');
        if (!tenant)
          return { ok: false, code: 'not_found', message: 'Business not found.' } as const;
        if (settingsVersion(tenant) !== input.data.version)
          return {
            ok: false,
            code: 'conflict',
            message:
              'Settings changed since you opened this form. Reload the current settings before saving.',
          } as const;
        const approver = await tx.query.approvers.findFirst({
          where: (p, { and, eq }) => and(eq(p.tenantId, tenantId), eq(p.id, input.data.approverId)),
        });
        if (!approver)
          return {
            ok: false,
            code: 'invalid',
            message: 'Choose a named approver from this business.',
          } as const;
        const { reason } = input.data;
        const rules = {
          ...input.data.rules,
          vatPercent: formatMinor(minorUnits(input.data.rules.vatPercent)),
          discountApprovalPercent: formatMinor(
            minorUnits(input.data.rules.discountApprovalPercent),
          ),
          minimumOrder: formatMinor(minorUnits(input.data.rules.minimumOrder)),
        };
        if (tenantId === 'rimal' && rules.autoSend !== 'off')
          return {
            ok: false,
            code: 'invalid',
            message: 'Automatic sending must remain off for Rimal.',
          } as const;
        const commercial = CommercialRules.parse(tenant.commercialRules);
        const crewValues = [
          rules.stageThresholdM2,
          rules.screenThresholdM2,
          rules.crewShiftsPerOrder,
        ];
        if (
          commercial.crew
            ? crewValues.some((value) => value === null)
            : crewValues.some((value) => value !== null)
        )
          return {
            ok: false,
            code: 'invalid',
            message: 'Crew settings must match the configured catalogue services.',
          } as const;
        const before = rulesFromTenant(tenant);
        // A save of unchanged values creates neither a revision nor an audit entry.
        if (JSON.stringify(before) === JSON.stringify(rules))
          return { ok: true, changed: false } as const;
        const id = randomUUID();
        await tx
          .update(tenants)
          .set({
            vatBasisPoints: Number(minorUnits(rules.vatPercent)),
            discountThresholdBasisPoints: Number(minorUnits(rules.discountApprovalPercent)),
            minimumOrderMinor: minorUnits(rules.minimumOrder),
            serviceAreas: rules.serviceAreas,
            faq: rules.faq,
            autoSend: rules.autoSend,
            commercialRules: {
              ...commercial,
              version: `settings-${id}`,
              minimumRentalMonths: rules.minimumRentalMonths,
              maximumRentalMonths: rules.maximumRentalMonths,
              delivery: { ...commercial.delivery, basis: rules.deliveryBasis },
              crew: commercial.crew
                ? {
                    ...commercial.crew,
                    stageThresholdM2: rules.stageThresholdM2,
                    screenThresholdM2: rules.screenThresholdM2,
                    shiftsPerOrder: rules.crewShiftsPerOrder,
                  }
                : null,
            },
          })
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

type StoredTenant = typeof tenants.$inferSelect;
export function rulesFromTenant(tenant: StoredTenant): BusinessRules {
  const commercial = CommercialRules.parse(tenant.commercialRules);
  return {
    vatPercent: formatMinor(BigInt(tenant.vatBasisPoints)),
    discountApprovalPercent: formatMinor(BigInt(tenant.discountThresholdBasisPoints)),
    minimumOrder: formatMinor(tenant.minimumOrderMinor),
    serviceAreas: tenant.serviceAreas,
    faq: tenant.faq,
    autoSend: tenant.autoSend,
    minimumRentalMonths: commercial.minimumRentalMonths,
    maximumRentalMonths: commercial.maximumRentalMonths,
    deliveryBasis: commercial.delivery.basis,
    stageThresholdM2: commercial.crew?.stageThresholdM2 ?? null,
    screenThresholdM2: commercial.crew?.screenThresholdM2 ?? null,
    crewShiftsPerOrder: commercial.crew?.shiftsPerOrder ?? null,
  };
}
function settingsVersion(tenant: StoredTenant) {
  return createHash('sha256')
    .update(JSON.stringify({ rules: rulesFromTenant(tenant), commercial: tenant.commercialRules }))
    .digest('hex');
}
function minorUnits(value: string) {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export type SettingsService = ReturnType<typeof createSettingsService>;
