import { createHash } from 'node:crypto';
import { ENGINE_VERSION } from '../pricing/evaluate.ts';
import type { PricingContext } from '../pricing/types.ts';
import { DraftOutput } from './model.ts';
import { DRAFT_INSTRUCTIONS } from './prompt.ts';

export const DRAFT_PARAMETERS = {
  max_output_tokens: 3000,
  reasoning: { effort: 'medium' as const },
  store: false as const,
};
export function hash(value: unknown) {
  return createHash('sha256')
    .update(
      JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)),
    )
    .digest('hex');
}

// JSONB can reorder nested object keys; comparisons must depend on values.
export function sameConfiguration(left: unknown, right: unknown) {
  const canonical = (value: unknown) =>
    JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (item && typeof item === 'object' && !Array.isArray(item))
        return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
      return item;
    });
  return canonical(left) === canonical(right);
}

export function agentVersion(model: string, instructions = DRAFT_INSTRUCTIONS) {
  const configuration = {
    model,
    promptHash: hash(instructions),
    parameters: DRAFT_PARAMETERS,
    schemaHash: hash(DraftOutput.toJSONSchema()),
    engineVersion: ENGINE_VERSION,
  };
  return { id: hash(configuration), ...configuration };
}

export function pricingVersion(context: PricingContext) {
  const { createdAt: _tenantTime, ...tenant } = context.tenant;
  const { createdAt: _catalogueTime, ...catalogue } = context.catalogue;
  return hash({
    tenant,
    catalogue,
    rows: [...context.rows].sort((a, b) => a.id.localeCompare(b.id)),
  });
}
