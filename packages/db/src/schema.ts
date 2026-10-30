import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

function tenantPolicy(column: AnyPgColumn) {
  const condition = sql`${column} = (select nullif(current_setting('app.tenant_id', true), ''))`;
  return pgPolicy('tenant_isolation', {
    for: 'all',
    to: 'public',
    using: condition,
    withCheck: condition,
  });
}

export const tenants = pgTable(
  'tenants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    location: text('location').notNull(),
    timezone: text('timezone').notNull(),
    sells: text('sells').notNull(),
    currency: text('currency', { enum: ['AED', 'SAR'] }).notNull(),
    currencyMinorUnits: integer('currency_minor_units').notNull(),
    vatBasisPoints: integer('vat_basis_points').notNull(),
    languages: text('languages').array().notNull(),
    autoSend: text('auto_send', { enum: ['low_risk_only', 'off'] }).notNull(),
    discountThresholdBasisPoints: integer('discount_threshold_basis_points').notNull(),
    serviceAreas: text('service_areas').array().notNull(),
    outsideServiceArea: text('outside_service_area', { enum: ['hand_off'] }).notNull(),
    minimumOrderMinor: bigint('minimum_order_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    faq: text('faq').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('tenants_id_format', sql`${t.id} ~ '^[a-z][a-z0-9_-]{0,63}$'`),
    check('tenants_currency', sql`${t.currency} in ('AED', 'SAR') and ${t.currencyMinorUnits} = 2`),
    check(
      'tenants_rates',
      sql`${t.vatBasisPoints} between 0 and 10000 and ${t.discountThresholdBasisPoints} between 0 and 10000`,
    ),
    check(
      'tenants_policy',
      sql`${t.autoSend} in ('low_risk_only', 'off') and ${t.outsideServiceArea} = 'hand_off' and ${t.minimumOrderMinor} >= 0`,
    ),
    check(
      'tenants_lists',
      sql`cardinality(${t.languages}) > 0 and ${t.languages} <@ array['ar','en']::text[] and cardinality(${t.serviceAreas}) > 0`,
    ),
    tenantPolicy(t.id),
  ],
);

export const approvers = pgTable(
  'approvers',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: text('id').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), tenantPolicy(t.tenantId)],
);

export const receivingChannels = pgTable(
  'receiving_channels',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    channel: text('channel', { enum: ['whatsapp', 'email', 'webform'] }).notNull(),
    address: text('address').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.channel, t.address] }),
    index('receiving_channels_tenant_idx').on(t.tenantId),
    check('receiving_channels_kind', sql`${t.channel} in ('whatsapp', 'email', 'webform')`),
    tenantPolicy(t.tenantId),
  ],
);

export const catalogueVersions = pgTable(
  'catalogue_versions',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    version: text('version').notNull(),
    source: text('source').notNull(),
    sourceHash: text('source_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.version] }),
    check('catalogue_versions_hash', sql`${t.sourceHash} ~ '^[a-f0-9]{64}$'`),
    tenantPolicy(t.tenantId),
  ],
);

export const catalogueRows = pgTable(
  'catalogue_rows',
  {
    tenantId: text('tenant_id').notNull(),
    version: text('version').notNull(),
    id: text('id').notNull(),
    item: text('item').notNull(),
    itemArabic: text('item_arabic'),
    rentPerMonthMinor: bigint('rent_per_month_minor', { mode: 'bigint' }),
    buyMinor: bigint('buy_minor', { mode: 'bigint' }),
    perDayMinor: bigint('per_day_minor', { mode: 'bigint' }),
    perShiftMinor: bigint('per_shift_minor', { mode: 'bigint' }),
    flatMinor: bigint('flat_minor', { mode: 'bigint' }),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.version, t.id] }),
    foreignKey({
      name: 'catalogue_rows_version_fk',
      columns: [t.tenantId, t.version],
      foreignColumns: [catalogueVersions.tenantId, catalogueVersions.version],
    }),
    check(
      'catalogue_rows_price_shape',
      sql`(
    (num_nonnulls(${t.rentPerMonthMinor}, ${t.buyMinor}) >= 1 and num_nonnulls(${t.perDayMinor}, ${t.perShiftMinor}, ${t.flatMinor}) = 0)
    or (${t.rentPerMonthMinor} is null and ${t.buyMinor} is null and num_nonnulls(${t.perDayMinor}, ${t.perShiftMinor}, ${t.flatMinor}) = 1)
  )`,
    ),
    check(
      'catalogue_rows_nonnegative',
      sql`${t.rentPerMonthMinor} >= 0 and ${t.buyMinor} >= 0 and ${t.perDayMinor} >= 0 and ${t.perShiftMinor} >= 0 and ${t.flatMinor} >= 0`,
    ),
    tenantPolicy(t.tenantId),
  ],
);
