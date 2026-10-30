import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { createDatabase, type Database, withTenant } from './client.ts';
import { CommercialRules } from './commercial-rules.ts';
import { databaseUrl } from './config.ts';
import {
  approvers,
  catalogueRows,
  catalogueVersions,
  receivingChannels,
  tenants,
} from './schema.ts';
import { SourceCatalogue, SourceTenants, scaledInteger } from './seed-model.ts';

export async function loadSeed() {
  const businesses = SourceTenants.parse(
    await Bun.file(new URL('../../../seed/tenants.json', import.meta.url)).json(),
  );
  const catalogues = await Promise.all(
    businesses.tenants.map(async (tenant) => {
      const catalogue = SourceCatalogue.parse(
        await Bun.file(new URL(`../../../seed/prices-${tenant.id}.json`, import.meta.url)).json(),
      );
      if (catalogue.tenant !== tenant.id || catalogue.currency !== tenant.currency)
        throw new Error(`Catalogue ownership/currency mismatch for ${tenant.id}.`);
      return catalogue;
    }),
  );
  return { businesses: businesses.tenants, catalogues };
}

export async function seedDatabase(database: Database) {
  const { businesses, catalogues } = await loadSeed();
  const rules = z
    .record(z.string(), CommercialRules)
    .parse(await Bun.file(new URL('../../../seed/commercial-rules.json', import.meta.url)).json());
  for (const business of businesses) {
    const catalogue = catalogues.find((entry) => entry.tenant === business.id);
    if (!catalogue) throw new Error(`Missing catalogue for ${business.id}.`);
    const sourceHash = createHash('sha256').update(JSON.stringify(catalogue)).digest('hex');
    await withTenant(database, business.id, async (tx) => {
      await tx
        .insert(tenants)
        .values({
          id: business.id,
          name: business.name,
          shortName: business.id === 'qamar' ? 'Qamar' : 'Rimal',
          location: business.location,
          timezone: business.id === 'qamar' ? 'Asia/Dubai' : 'Asia/Riyadh',
          sells: business.sells,
          currency: business.currency,
          currencyMinorUnits: business.currency_minor_units,
          vatBasisPoints: Number(scaledInteger(business.vat_rate, 4)),
          languages: business.languages,
          autoSend: business.auto_send,
          discountThresholdBasisPoints: Number(
            scaledInteger(business.policy.discount_needs_approval_at_pct, 2),
          ),
          serviceAreas: business.policy.service_area,
          outsideServiceArea: business.policy.outside_service_area,
          minimumOrderMinor: scaledInteger(business.policy.minimum_order_before_vat ?? 0, 2),
          faq: business.faq,
          commercialRules: rules[business.id],
        })
        .onConflictDoNothing();
      if (!rules[business.id]) throw new Error('Missing commercial rules.');
      await tx
        .update(tenants)
        .set({ commercialRules: rules[business.id] })
        .where(and(eq(tenants.id, business.id), isNull(tenants.commercialRules)));
      await tx
        .insert(approvers)
        .values(business.approvers.map((person) => ({ ...person, tenantId: business.id })))
        .onConflictDoNothing();
      await tx
        .insert(receivingChannels)
        .values(business.channels.map((channel) => ({ ...channel, tenantId: business.id })))
        .onConflictDoNothing();
      await tx
        .insert(catalogueVersions)
        .values({
          tenantId: business.id,
          version: catalogue.version,
          source: `seed/prices-${business.id}.json`,
          sourceHash,
        })
        .onConflictDoNothing();
      const existing = await tx.query.catalogueVersions.findFirst({
        columns: { sourceHash: true },
        where: (stored, { and, eq }) =>
          and(eq(stored.tenantId, business.id), eq(stored.version, catalogue.version)),
      });
      if (existing?.sourceHash !== sourceHash)
        throw new Error(
          `Catalogue ${business.id}/${catalogue.version} changed; publish a new version instead.`,
        );
      await tx
        .insert(catalogueRows)
        .values(
          catalogue.rows.map((row) => ({
            tenantId: business.id,
            version: catalogue.version,
            id: row.id,
            item: row.item,
            itemArabic: row.item_ar ?? null,
            rentPerMonthMinor:
              row.rent_per_month === undefined ? null : scaledInteger(row.rent_per_month, 2),
            buyMinor: row.buy === undefined ? null : scaledInteger(row.buy, 2),
            perDayMinor: row.per_day === undefined ? null : scaledInteger(row.per_day, 2),
            perShiftMinor: row.per_shift === undefined ? null : scaledInteger(row.per_shift, 2),
            flatMinor: row.flat === undefined ? null : scaledInteger(row.flat, 2),
          })),
        )
        .onConflictDoNothing();
    });
  }
}

if (import.meta.main) {
  const database = createDatabase(databaseUrl('DATABASE_ADMIN_URL'), { max: 1 });
  try {
    await seedDatabase(database);
    console.log('Seeded 2 businesses, 4 approvers, 5 receiving channels and 20 catalogue rows.');
  } finally {
    await database.close();
  }
}
