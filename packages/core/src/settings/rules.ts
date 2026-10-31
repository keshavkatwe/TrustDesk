import { createHash } from 'node:crypto';
import { CommercialRules, type tenants } from '@trustdesk/db';
import { formatMinor } from '../pricing/decimal.ts';
import { type Failure, failure } from '../result.ts';
import type { BusinessRules } from './model.ts';

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
export function settingsVersion(tenant: StoredTenant) {
  return createHash('sha256')
    .update(JSON.stringify({ rules: rulesFromTenant(tenant), commercial: tenant.commercialRules }))
    .digest('hex');
}
function minorUnits(value: string) {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function normalizeRules(rules: BusinessRules): BusinessRules {
  return {
    ...rules,
    vatPercent: formatMinor(minorUnits(rules.vatPercent)),
    discountApprovalPercent: formatMinor(minorUnits(rules.discountApprovalPercent)),
    minimumOrder: formatMinor(minorUnits(rules.minimumOrder)),
  };
}

export function validateRules(
  tenant: StoredTenant,
  rules: BusinessRules,
): Failure<'invalid'> | undefined {
  if (tenant.id === 'rimal' && rules.autoSend !== 'off')
    return failure('invalid', 'Automatic sending must remain off for Rimal.');
  const commercial = CommercialRules.parse(tenant.commercialRules);
  const crewValues = [rules.stageThresholdM2, rules.screenThresholdM2, rules.crewShiftsPerOrder];
  if (
    commercial.crew
      ? crewValues.some((value) => value === null)
      : crewValues.some((value) => value !== null)
  )
    return failure('invalid', 'Crew settings must match the configured catalogue services.');
}

export function rulesPatch(tenant: StoredTenant, rules: BusinessRules, revisionId: string) {
  const commercial = CommercialRules.parse(tenant.commercialRules);
  return {
    vatBasisPoints: Number(minorUnits(rules.vatPercent)),
    discountThresholdBasisPoints: Number(minorUnits(rules.discountApprovalPercent)),
    minimumOrderMinor: minorUnits(rules.minimumOrder),
    serviceAreas: rules.serviceAreas,
    faq: rules.faq,
    autoSend: rules.autoSend,
    commercialRules: {
      ...commercial,
      version: `settings-${revisionId}`,
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
  };
}
