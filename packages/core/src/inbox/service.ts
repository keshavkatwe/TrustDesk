import { type Database, withTenant } from '@trustdesk/db';
import { failure } from '../result.ts';
import { Inbox, ReviewInput, Workspace } from './model.ts';
import { readBusiness, readItems } from './queries.ts';
import { type ReviewResult, reviewDraft } from './review.ts';

export type { ReviewResult } from './review.ts';

// The caller supplies the local operator's allowed businesses. This is not production authentication.
export function createInboxService(database: Database, allowedTenantIds: readonly string[]) {
  const allowed = new Set(allowedTenantIds);
  return {
    async workspace() {
      const businesses = await Promise.all(
        [...allowed].map((tenantId) =>
          withTenant(database, tenantId, (tx) => readBusiness(tx, tenantId)),
        ),
      );
      return Workspace.parse({ tenants: businesses.filter((entry) => entry !== undefined) });
    },
    async inbox(tenantId: string) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const tenant = await tx.query.tenants.findFirst({
          columns: { id: true },
          where: (tenant, { eq }) => eq(tenant.id, tenantId),
        });
        return tenant ? Inbox.parse({ items: await readItems(tx, tenantId) }) : undefined;
      });
    },
    async review(tenantId: string, id: string, rawInput: unknown): Promise<ReviewResult> {
      if (!allowed.has(tenantId)) return failure('not_found', 'Draft not found in this business.');
      const parsed = ReviewInput.safeParse(rawInput);
      if (!parsed.success)
        return failure('invalid_request', 'Check the review fields and try again.');
      const input = parsed.data;
      if (input.action !== 'approve' && !input.reason)
        return failure('reason_required', 'Add a reason for rejecting or handing off this draft.');
      return withTenant(database, tenantId, (tx) => reviewDraft(tx, tenantId, id, input));
    },
  };
}

export type InboxService = ReturnType<typeof createInboxService>;
