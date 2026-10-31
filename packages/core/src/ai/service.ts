import { type Database, withTenant } from '@trustdesk/db';
import { failure } from '../result.ts';
import { claimAttempt } from './claim.ts';
import { completeAttempt } from './complete.ts';
import { generateDraft } from './generate.ts';
import { type DraftProvider, GenerateInput } from './model.ts';
import type { DraftingResult } from './result.ts';

export function createDraftingService(
  database: Database,
  allowedTenantIds: readonly string[],
  provider?: DraftProvider,
) {
  const allowed = new Set(allowedTenantIds);
  return {
    async generate(tenantId: string, id: string, rawInput: unknown): Promise<DraftingResult> {
      if (!allowed.has(tenantId)) return failure('not_found', 'Draft not found in this business.');
      const parsed = GenerateInput.safeParse(rawInput);
      if (!parsed.success) return failure('invalid_request', 'Refresh the draft and try again.');
      if (!provider)
        return failure('unconfigured', 'AI drafting needs OPENAI_API_KEY in the API environment.');

      const claim = await withTenant(database, tenantId, (tx) =>
        claimAttempt(tx, tenantId, id, parsed.data.revision, provider.model),
      );
      if (!claim.ok) return claim;

      // Inference is deliberately between the claim and completion transactions.
      const generated = await generateDraft(provider, claim.attempt.input, claim.attempt.pricing);
      return withTenant(database, tenantId, (tx) =>
        completeAttempt(tx, tenantId, id, claim.attempt, generated, provider.model),
      );
    },
  };
}

export type DraftingService = ReturnType<typeof createDraftingService>;
