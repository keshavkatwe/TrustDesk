import { createHash } from 'node:crypto';
import { CommercialRules } from '@trustdesk/db';
import { Assessment, PricingRequest, type Quote } from './model.ts';
import { addReason, applyRequestPolicy, decideDisposition } from './policy.ts';
import { calculateQuote } from './quote.ts';
import { assertPricingScope } from './scope.ts';
import type { Evaluation, PricingContext } from './types.ts';

export type { PricingContext } from './types.ts';

export const ENGINE_VERSION = 'pricing-policy-4';

export function evaluateRequest(context: PricingContext, rawRequest: unknown): Assessment {
  const request = PricingRequest.parse(rawRequest);
  const { tenant, catalogue } = context;
  assertPricingScope(context);
  const configured = CommercialRules.safeParse(tenant.commercialRules);
  const state: Evaluation = {
    context,
    request,
    rules: configured.success ? configured.data : null,
    rows: new Map(context.rows.map((row) => [row.id, row])),
    reasons: [],
    missing: new Set(request.missing),
    blockApproval: false,
    handoff: request.intent === 'support',
    inArea: false,
    discountPercent: 0n,
  };
  applyRequestPolicy(state);
  let quote: Quote | null = null;
  try {
    quote = calculateQuote(state);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Amount exceeds the supported range.')
      throw error;
    quote = null;
    state.blockApproval = true;
    addReason(
      state,
      'amount_out_of_range',
      'Amount is outside the supported range',
      'No unsafe or rounded-down amount can be quoted.',
    );
  }
  if (state.handoff || request.intent !== 'quote') quote = null;
  if (quote)
    addReason(
      state,
      'firm_quote',
      'Firm price needs named approval',
      'Catalogue prices and totals were recomputed by code. A person must approve the commercial reply.',
      `catalogue ${catalogue.version}`,
    );
  const disposition = decideDisposition(state);
  const output = {
    engineVersion: ENGINE_VERSION,
    catalogueVersion: catalogue.version,
    request,
    disposition,
    blockApproval: state.blockApproval,
    quote,
    reasons: state.reasons,
    missing: [...state.missing],
  };
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        {
          tenant,
          catalogue,
          rows: [...context.rows].sort((a, b) => a.id.localeCompare(b.id)),
          trust: context.trust,
          output,
        },
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      ),
    )
    .digest('hex');
  return Assessment.parse({ ...output, fingerprint });
}
