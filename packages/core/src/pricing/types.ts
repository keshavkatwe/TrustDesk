import type { CommercialRules, catalogueRows, catalogueVersions, tenants } from '@trustdesk/db';
import type { Assessment, PricingRequest } from './model.ts';

export type CatalogueRow = typeof catalogueRows.$inferSelect;
export type PricingContext = {
  tenant: typeof tenants.$inferSelect;
  catalogue: typeof catalogueVersions.$inferSelect;
  rows: CatalogueRow[];
  trust: 'supervised' | 'autonomous';
};

// Internal state belongs to one evaluation. Policy and pricing append reasons in execution order.
export type Evaluation = {
  context: PricingContext;
  request: PricingRequest;
  rules: CommercialRules | null;
  rows: Map<string, CatalogueRow>;
  reasons: Assessment['reasons'];
  missing: Set<string>;
  blockApproval: boolean;
  handoff: boolean;
  inArea: boolean;
  discountPercent: bigint;
};
