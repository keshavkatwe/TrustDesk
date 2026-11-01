import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
    commercialRules: jsonb('commercial_rules'),
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

export const conversations = pgTable(
  'conversations',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: text('id').notNull(),
    channel: text('channel', { enum: ['whatsapp', 'email', 'webform'] }).notNull(),
    customer: text('customer').notNull(),
    latestSequence: integer('latest_sequence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('conversations_customer_key').on(t.tenantId, t.channel, t.customer),
    check('conversations_channel', sql`${t.channel} in ('whatsapp', 'email', 'webform')`),
    check('conversations_sequence', sql`${t.latestSequence} > 0`),
    tenantPolicy(t.tenantId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(),
    conversationId: text('conversation_id').notNull(),
    sequence: integer('sequence').notNull(),
    channel: text('channel', { enum: ['whatsapp', 'email', 'webform'] }).notNull(),
    channelMessageId: text('channel_message_id').notNull(),
    sourceEvent: text('source_event').notNull(),
    body: text('body').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    processingState: text('processing_state', {
      enum: ['queued', 'processing', 'ready', 'failed', 'superseded'],
    })
      .notNull()
      .default('ready'),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('messages_delivery_key').on(t.tenantId, t.channel, t.channelMessageId),
    unique('messages_conversation_sequence_key').on(t.tenantId, t.conversationId, t.sequence),
    foreignKey({
      columns: [t.tenantId, t.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
    }),
    check('messages_channel', sql`${t.channel} in ('whatsapp', 'email', 'webform')`),
    check('messages_sequence', sql`${t.sequence} > 0`),
    check(
      'messages_processing',
      sql`${t.processingState} in ('queued','processing','ready','failed','superseded')`,
    ),
    tenantPolicy(t.tenantId),
  ],
);

export const drafts = pgTable(
  'drafts',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(),
    messageId: text('message_id').notNull(),
    version: integer('version').notNull().default(1),
    revision: integer('revision').notNull().default(1),
    status: text('status', {
      enum: ['needs_approval', 'approved', 'rejected', 'handed_off', 'superseded'],
    }).notNull(),
    originalReply: text('original_reply').notNull(),
    evidence: jsonb('evidence').notNull(),
    provenance: text('provenance', { enum: ['sample', 'openai', 'received'] })
      .notNull()
      .default('sample'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('drafts_message_version_key').on(t.tenantId, t.messageId, t.version),
    foreignKey({
      columns: [t.tenantId, t.messageId],
      foreignColumns: [messages.tenantId, messages.id],
    }),
    check(
      'drafts_status',
      sql`${t.status} in ('needs_approval','approved','rejected','handed_off','superseded')`,
    ),
    check('drafts_revision', sql`${t.version} > 0 and ${t.revision} > 0`),
    check('drafts_provenance', sql`${t.provenance} in ('sample', 'openai', 'received')`),
    index('drafts_inbox_idx').on(t.tenantId, t.status, t.createdAt),
    tenantPolicy(t.tenantId),
  ],
);

export const reviews = pgTable(
  'reviews',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(),
    draftId: text('draft_id').notNull(),
    draftRevision: integer('draft_revision').notNull(),
    approverId: text('approver_id').notNull(),
    approverName: text('approver_name').notNull(),
    action: text('action', { enum: ['approve', 'reject', 'hand_off'] }).notNull(),
    originalReply: text('original_reply').notNull(),
    reply: text('reply').notNull(),
    reason: text('reason').notNull(),
    editDiff: jsonb('edit_diff').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('reviews_one_decision_key').on(t.tenantId, t.draftId),
    unique('reviews_approved_reference_key').on(t.tenantId, t.id, t.action),
    foreignKey({ columns: [t.tenantId, t.draftId], foreignColumns: [drafts.tenantId, drafts.id] }),
    foreignKey({
      columns: [t.tenantId, t.approverId],
      foreignColumns: [approvers.tenantId, approvers.id],
    }),
    index('reviews_approver_idx').on(t.tenantId, t.approverId),
    check(
      'reviews_input',
      sql`${t.draftRevision} > 0 and length(btrim(${t.reply})) between 1 and 4000 and length(${t.reason}) <= 1000`,
    ),
    check(
      'reviews_action',
      sql`${t.action} in ('approve','reject','hand_off') and (${t.action} = 'approve' or length(btrim(${t.reason})) > 0)`,
    ),
    tenantPolicy(t.tenantId),
  ],
);

export const outbox = pgTable(
  'outbox',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(),
    reviewId: text('review_id'),
    draftId: text('draft_id'),
    trustEventId: text('trust_event_id'),
    action: text('action').notNull().default('approve'),
    status: text('status', { enum: ['pending'] })
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('outbox_one_intent_key').on(t.tenantId, t.reviewId),
    unique('outbox_one_automatic_intent_key').on(t.tenantId, t.draftId),
    foreignKey({ columns: [t.tenantId, t.draftId], foreignColumns: [drafts.tenantId, drafts.id] }),
    foreignKey({
      columns: [t.tenantId, t.trustEventId],
      foreignColumns: [trustEvents.tenantId, trustEvents.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.reviewId, t.action],
      foreignColumns: [reviews.tenantId, reviews.id, reviews.action],
    }),
    check(
      'outbox_approval_only',
      sql`${t.status} = 'pending' and (
      (${t.action} = 'approve' and ${t.reviewId} is not null and ${t.draftId} is null and ${t.trustEventId} is null)
      or (${t.action} = 'auto_send' and ${t.reviewId} is null and ${t.draftId} is not null and ${t.trustEventId} is not null))`,
    ),
    tenantPolicy(t.tenantId),
  ],
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(),
    messageId: text('message_id').notNull(),
    sourceDraftId: text('source_draft_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    resultDraftId: text('result_draft_id'),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputHash: text('input_hash').notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed', 'superseded'] }).notNull(),
    errorCode: text('error_code'),
    responseId: text('response_id'),
    output: jsonb('output'),
    usage: jsonb('usage'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.messageId],
      foreignColumns: [messages.tenantId, messages.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.sourceDraftId],
      foreignColumns: [drafts.tenantId, drafts.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.resultDraftId],
      foreignColumns: [drafts.tenantId, drafts.id],
    }),
    uniqueIndex('ai_runs_active_message_key')
      .on(t.tenantId, t.messageId)
      .where(sql`${t.status} = 'running'`),
    index('ai_runs_message_idx').on(t.tenantId, t.messageId, t.createdAt),
    check('ai_runs_status', sql`${t.status} in ('running','succeeded','failed','superseded')`),
    check('ai_runs_revision', sql`${t.sourceRevision} > 0`),
    check('ai_runs_hash', sql`${t.inputHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'ai_runs_completion',
      sql`(${t.status} = 'running' and ${t.finishedAt} is null) or (${t.status} <> 'running' and ${t.finishedAt} is not null)`,
    ),
    tenantPolicy(t.tenantId),
  ],
);

export const eventReceipts = pgTable(
  'event_receipts',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(),
    eventId: text('event_id').notNull(),
    messageId: text('message_id').notNull(),
    outcome: text('outcome', { enum: ['accepted', 'duplicate', 'conflict'] }).notNull(),
    bodyHash: text('body_hash').notNull(),
    claimedTenant: text('claimed_tenant'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.messageId],
      foreignColumns: [messages.tenantId, messages.id],
    }),
    index('event_receipts_message_idx').on(t.tenantId, t.messageId),
    check('event_receipts_outcome', sql`${t.outcome} in ('accepted','duplicate','conflict')`),
    check('event_receipts_hash', sql`${t.bodyHash} ~ '^[a-f0-9]{64}$'`),
    tenantPolicy(t.tenantId),
  ],
);

export const deliveries = pgTable(
  'deliveries',
  {
    tenantId: text('tenant_id').notNull(),
    outboxId: text('outbox_id').notNull(),
    status: text('status', { enum: ['simulated_sent', 'cancelled'] }).notNull(),
    reason: text('reason').notNull(),
    simulatedMessageId: text('simulated_message_id'),
    reply: text('reply').notNull(),
    destination: text('destination').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.outboxId] }),
    foreignKey({ columns: [t.tenantId, t.outboxId], foreignColumns: [outbox.tenantId, outbox.id] }),
    check(
      'deliveries_status',
      sql`(${t.status} = 'simulated_sent' and ${t.simulatedMessageId} is not null) or (${t.status} = 'cancelled' and ${t.simulatedMessageId} is null)`,
    ),
    tenantPolicy(t.tenantId),
  ],
);

export const settingsChanges = pgTable(
  'settings_changes',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: text('id').notNull(),
    approverId: text('approver_id').notNull(),
    approverName: text('approver_name').notNull(),
    reason: text('reason').notNull(),
    before: jsonb('before').notNull(),
    after: jsonb('after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.approverId],
      foreignColumns: [approvers.tenantId, approvers.id],
    }),
    index('settings_changes_tenant_time_idx').on(t.tenantId, t.createdAt),
    check('settings_changes_reason', sql`length(btrim(${t.reason})) between 1 and 1000`),
    tenantPolicy(t.tenantId),
  ],
);

// Evaluation payloads are synthetic, versioned evidence, never inbox messages.
export const evaluationRuns = pgTable(
  'evaluation_runs',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: text('id').notNull(),
    agentId: text('agent_id').notNull(),
    contextHash: text('context_hash').notNull(),
    suiteHash: text('suite_hash').notNull(),
    baselineId: text('baseline_id'),
    accepted: integer('accepted').notNull().default(0),
    report: jsonb('report').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    foreignKey({ columns: [t.tenantId, t.baselineId], foreignColumns: [t.tenantId, t.id] }),
    check(
      'evaluation_runs_hashes',
      sql`${t.agentId} ~ '^[a-f0-9]{64}$' and ${t.contextHash} ~ '^[a-f0-9]{64}$' and ${t.suiteHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check('evaluation_runs_accepted', sql`${t.accepted} in (0,1)`),
    index('evaluation_runs_recent_idx').on(t.tenantId, t.createdAt),
    tenantPolicy(t.tenantId),
  ],
);

export const evaluationLabels = pgTable(
  'evaluation_labels',
  {
    tenantId: text('tenant_id').notNull(),
    runId: text('run_id').notNull(),
    caseId: text('case_id').notNull(),
    approverId: text('approver_id').notNull(),
    approverName: text('approver_name').notNull(),
    dimensions: jsonb('dimensions').notNull(),
    rationale: text('rationale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.runId, t.caseId] }),
    foreignKey({
      columns: [t.tenantId, t.runId],
      foreignColumns: [evaluationRuns.tenantId, evaluationRuns.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.approverId],
      foreignColumns: [approvers.tenantId, approvers.id],
    }),
    check('evaluation_labels_reason', sql`length(btrim(${t.rationale})) between 1 and 1000`),
    tenantPolicy(t.tenantId),
  ],
);

export const trustEvents = pgTable(
  'trust_events',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(),
    agentId: text('agent_id').notNull(),
    contextHash: text('context_hash').notNull(),
    runId: text('run_id').notNull(),
    level: text('level', { enum: ['supervised', 'autonomous'] }).notNull(),
    approverId: text('approver_id'),
    approverName: text('approver_name'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.runId],
      foreignColumns: [evaluationRuns.tenantId, evaluationRuns.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.approverId],
      foreignColumns: [approvers.tenantId, approvers.id],
    }),
    check(
      'trust_events_promotion',
      sql`${t.level} in ('supervised','autonomous') and (${t.level} <> 'autonomous' or (${t.approverId} is not null and ${t.approverName} is not null))`,
    ),
    check('trust_events_reason', sql`length(btrim(${t.reason})) between 1 and 1000`),
    index('trust_events_version_idx').on(t.tenantId, t.agentId, t.contextHash, t.createdAt),
    tenantPolicy(t.tenantId),
  ],
);
