import { fixtures, workspace } from './fixtures.ts';
import type { ReviewInput, Tenant } from './model.ts';

// Disposable, app-local UI fixture state. Replace with durable core services in the next stage.
export function createDemoService() {
  const items = structuredClone(fixtures.items);
  return {
    workspace,
    inbox(tenantId: Tenant['id']) {
      return { items: items.filter((item) => item.tenantId === tenantId) };
    },
    review(tenantId: Tenant['id'], id: string, input: ReviewInput) {
      const item = items.find((entry) => entry.tenantId === tenantId && entry.id === id);
      if (!item)
        return {
          ok: false,
          code: 'message_not_found',
          message: 'Message not found in this business.',
        } as const;
      const actor = workspace.tenants
        .find((tenant) => tenant.id === tenantId)
        ?.approvers.find((approver) => approver.id === input.approverId);
      if (!actor)
        return {
          ok: false,
          code: 'invalid_approver',
          message: 'Choose an approver from this business.',
        } as const;
      if (item.status !== 'needs_approval' || item.revision !== input.revision) {
        return {
          ok: false,
          code: 'stale_draft',
          message: 'This draft has changed or was already reviewed. Refresh the inbox.',
        } as const;
      }
      if (input.action !== 'approve' && !input.reason) {
        return {
          ok: false,
          code: 'reason_required',
          message: 'Add a reason for rejecting or handing off this draft.',
        } as const;
      }
      item.decision = {
        action: input.action,
        approverName: actor.name,
        at: new Date().toISOString(),
        originalReply: item.draftReply,
        reply: input.reply,
        reason: input.reason,
      };
      item.draftReply = input.reply;
      item.status =
        input.action === 'approve'
          ? 'approved'
          : input.action === 'reject'
            ? 'rejected'
            : 'handed_off';
      item.revision += 1;
      return { ok: true, item } as const;
    },
  };
}
