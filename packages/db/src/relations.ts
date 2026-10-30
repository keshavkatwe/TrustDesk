import { relations } from 'drizzle-orm';
import {
  aiRuns,
  approvers,
  catalogueRows,
  catalogueVersions,
  conversations,
  deliveries,
  drafts,
  eventReceipts,
  messages,
  outbox,
  receivingChannels,
  reviews,
  tenants,
} from './schema.ts';

// Match the database's composite foreign keys, including tenant ownership.
export const tenantRelations = relations(tenants, ({ many }) => ({
  approvers: many(approvers),
  receivingChannels: many(receivingChannels),
  catalogueVersions: many(catalogueVersions),
  conversations: many(conversations),
}));

export const approverRelations = relations(approvers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [approvers.tenantId], references: [tenants.id] }),
  reviews: many(reviews),
}));

export const receivingChannelRelations = relations(receivingChannels, ({ one }) => ({
  tenant: one(tenants, { fields: [receivingChannels.tenantId], references: [tenants.id] }),
}));

export const catalogueVersionRelations = relations(catalogueVersions, ({ one, many }) => ({
  tenant: one(tenants, { fields: [catalogueVersions.tenantId], references: [tenants.id] }),
  rows: many(catalogueRows),
}));

export const catalogueRowRelations = relations(catalogueRows, ({ one }) => ({
  catalogueVersion: one(catalogueVersions, {
    fields: [catalogueRows.tenantId, catalogueRows.version],
    references: [catalogueVersions.tenantId, catalogueVersions.version],
  }),
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [conversations.tenantId], references: [tenants.id] }),
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.tenantId, messages.conversationId],
    references: [conversations.tenantId, conversations.id],
  }),
  drafts: many(drafts),
  aiRuns: many(aiRuns),
  eventReceipts: many(eventReceipts),
}));

export const draftRelations = relations(drafts, ({ one, many }) => ({
  message: one(messages, {
    fields: [drafts.tenantId, drafts.messageId],
    references: [messages.tenantId, messages.id],
  }),
  review: one(reviews),
  sourceRuns: many(aiRuns, { relationName: 'sourceDraft' }),
  resultRuns: many(aiRuns, { relationName: 'resultDraft' }),
}));

export const reviewRelations = relations(reviews, ({ one }) => ({
  draft: one(drafts, {
    fields: [reviews.tenantId, reviews.draftId],
    references: [drafts.tenantId, drafts.id],
  }),
  approver: one(approvers, {
    fields: [reviews.tenantId, reviews.approverId],
    references: [approvers.tenantId, approvers.id],
  }),
  outbox: one(outbox),
}));

export const outboxRelations = relations(outbox, ({ one }) => ({
  review: one(reviews, {
    fields: [outbox.tenantId, outbox.reviewId, outbox.action],
    references: [reviews.tenantId, reviews.id, reviews.action],
  }),
  delivery: one(deliveries),
}));

export const aiRunRelations = relations(aiRuns, ({ one }) => ({
  message: one(messages, {
    fields: [aiRuns.tenantId, aiRuns.messageId],
    references: [messages.tenantId, messages.id],
  }),
  sourceDraft: one(drafts, {
    relationName: 'sourceDraft',
    fields: [aiRuns.tenantId, aiRuns.sourceDraftId],
    references: [drafts.tenantId, drafts.id],
  }),
  resultDraft: one(drafts, {
    relationName: 'resultDraft',
    fields: [aiRuns.tenantId, aiRuns.resultDraftId],
    references: [drafts.tenantId, drafts.id],
  }),
}));

export const eventReceiptRelations = relations(eventReceipts, ({ one }) => ({
  message: one(messages, {
    fields: [eventReceipts.tenantId, eventReceipts.messageId],
    references: [messages.tenantId, messages.id],
  }),
}));

export const deliveryRelations = relations(deliveries, ({ one }) => ({
  outbox: one(outbox, {
    fields: [deliveries.tenantId, deliveries.outboxId],
    references: [outbox.tenantId, outbox.id],
  }),
}));
