import { normalizeDigits, scaled } from './decimal.ts';
import type { Assessment } from './model.ts';
import type { Evaluation } from './types.ts';

export function addReason(
  state: Evaluation,
  code: string,
  title: string,
  detail: string,
  source = 'tenant policy',
) {
  if (!state.reasons.some((reason) => reason.code === code))
    state.reasons.push({ code, title, detail, source });
}

export function applyRequestPolicy(state: Evaluation) {
  const { request, rules: configured } = state;
  const { tenant } = state.context;
  if (request.intent === 'spam')
    addReason(state, 'spam', 'No reply', 'Spam classification is held as a drop decision.');
  if (state.handoff)
    addReason(
      state,
      'support',
      'Support needs a person',
      'Route the existing-customer support request to the team.',
    );
  if (!configured) {
    state.handoff = true;
    state.blockApproval = true;
    addReason(
      state,
      'missing_rules',
      'Commercial configuration unavailable',
      'Do not quote until the configured business rules are valid.',
    );
  }
  const normalizeLocation = (value: string) =>
    value.trim().normalize('NFKC').toLocaleLowerCase('en');
  const location = request.location === null ? null : normalizeLocation(request.location);
  const canonicalLocation =
    location === null ? null : (configured?.locationAliases[location] ?? location);
  state.inArea =
    canonicalLocation !== null &&
    tenant.serviceAreas.some(
      (area) => normalizeLocation(area) === normalizeLocation(canonicalLocation),
    );
  if (location !== null && !state.inArea) {
    state.handoff = true;
    state.blockApproval = true;
    addReason(
      state,
      'outside_service_area',
      'Outside the service area',
      `Configured service areas: ${tenant.serviceAreas.join(', ')}. Confirm this location with the team.`,
    );
  }
  if (request.intent === 'quote' && location === null)
    state.missing.add('Service / delivery location');
  if (request.availabilityRequested)
    addReason(
      state,
      'availability',
      'Availability needs confirmation',
      'The catalogue contains prices, not live availability or confirmed delivery dates.',
    );
  if (request.discountRequested && request.discountPercent === null)
    addReason(
      state,
      'discount_unspecified',
      'Discount requested; none applied',
      'Ask the named approver about a discount. A request for a better price is not a discount percentage.',
    );
  const percent = scaled(request.discountPercent ?? '0');
  state.discountPercent = percent;
  if (percent > 0n) {
    addReason(
      state,
      'custom_discount',
      'Custom deal needs named approval',
      `Requested discount: ${normalizeDigits(request.discountPercent ?? '0')}%.`,
    );
    if (percent >= BigInt(tenant.discountThresholdBasisPoints) * 100n)
      addReason(
        state,
        'discount_threshold',
        'Discount meets the approval threshold',
        `Requested discount is at or above ${tenant.discountThresholdBasisPoints / 100}%.`,
      );
  }
  if (request.intent === 'quote' && request.lines.length === 0)
    state.missing.add('Product and quantity');
}

export function decideDisposition(state: Evaluation): Assessment['disposition'] {
  const { request, context } = state;
  const { tenant } = context;
  const verifiedFaq =
    request.intent === 'faq' &&
    request.language === 'English' &&
    request.faqIndex !== null &&
    tenant.faq[request.faqIndex] !== undefined &&
    request.lines.length === 0 &&
    request.requestedDate === null &&
    !request.availabilityRequested &&
    !request.discountRequested &&
    request.discountPercent === null &&
    state.missing.size === 0 &&
    !state.blockApproval &&
    !state.handoff;
  let disposition: Assessment['disposition'] = 'needs_approval';
  if (request.intent === 'spam') {
    disposition = 'drop';
    state.blockApproval = true;
  } else if (state.handoff) {
    disposition = 'hand_off';
    state.blockApproval = true;
  } else if (verifiedFaq && tenant.autoSend === 'low_risk_only' && context.trust === 'autonomous')
    disposition = 'auto_send';
  else {
    if (!verifiedFaq)
      addReason(
        state,
        'review_required',
        'Human review required',
        'Only a verified non-committing FAQ reply can qualify as low risk.',
      );
    if (tenant.autoSend === 'off')
      addReason(
        state,
        'auto_send_off',
        'Automatic sending is disabled',
        'This business requires named approval for every reply.',
      );
    if (context.trust !== 'autonomous')
      addReason(
        state,
        'supervised',
        'Officer remains supervised',
        'Autonomous trust has not been established for this business/version.',
      );
  }

  return disposition;
}
