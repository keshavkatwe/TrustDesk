import { randomUUID } from 'node:crypto';
import { drafts, outbox, type TenantTransaction } from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { DEFAULT_MODEL } from '../ai/model.ts';
import { agentVersion, pricingVersion } from '../ai/version.ts';
import { lockTrust, readTrust } from '../evaluation/data.ts';
import { evaluateRequest, type PricingContext } from '../pricing/evaluate.ts';
import type { PricingRequest } from '../pricing/model.ts';

export async function queueAutomaticReply(
  tx: TenantTransaction,
  tenantId: string,
  draftId: string,
  pricing: PricingContext,
  request: PricingRequest,
  model = DEFAULT_MODEL,
) {
  if (evaluateRequest(pricing, request).disposition !== 'auto_send') return;
  await lockTrust(tx, tenantId);
  const event = await readTrust(tx, tenantId, agentVersion(model).id, pricingVersion(pricing));
  if (event?.level !== 'autonomous') return;
  await tx
    .update(drafts)
    .set({ status: 'approved' })
    .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, draftId)));
  await tx
    .insert(outbox)
    .values({ tenantId, id: randomUUID(), draftId, trustEventId: event.id, action: 'auto_send' });
}
