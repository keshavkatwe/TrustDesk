import { createHash } from 'node:crypto';
import {
  CommercialRules,
  type catalogueRows,
  type catalogueVersions,
  type tenants,
} from '@trustdesk/db';
import { formatMinor, normalizeDigits, roundHalfUp, SCALE, safeMinor, scaled } from './decimal.ts';
import { Assessment, PricingRequest, type Quote } from './model.ts';

export const ENGINE_VERSION = 'pricing-policy-1';
export type PricingContext = {
  tenant: typeof tenants.$inferSelect;
  catalogue: typeof catalogueVersions.$inferSelect;
  rows: (typeof catalogueRows.$inferSelect)[];
  trust: 'supervised' | 'autonomous';
};

export function evaluateRequest(context: PricingContext, rawRequest: unknown): Assessment {
  const request = PricingRequest.parse(rawRequest);
  const { tenant, catalogue } = context;
  if (
    catalogue.tenantId !== tenant.id ||
    context.rows.some((row) => row.tenantId !== tenant.id || row.version !== catalogue.version)
  )
    throw new Error('Catalogue context must belong to exactly one business and version.');
  const rules = CommercialRules.safeParse(tenant.commercialRules);
  const reasons: Assessment['reasons'] = [];
  const missing = new Set(request.missing);
  let blockApproval = false;
  let handoff = request.intent === 'support';
  const add = (code: string, title: string, detail: string, source = 'tenant policy') => {
    if (!reasons.some((reason) => reason.code === code))
      reasons.push({ code, title, detail, source });
  };
  if (request.intent === 'spam')
    add('spam', 'No reply', 'Spam classification is held as a drop decision.');
  if (handoff)
    add(
      'support',
      'Support needs a person',
      'Route the existing-customer support request to the team.',
    );
  if (!rules.success) {
    handoff = true;
    blockApproval = true;
    add(
      'missing_rules',
      'Commercial configuration unavailable',
      'Do not quote until the configured business rules are valid.',
    );
  }
  const configured = rules.success ? rules.data : null;
  const normalizeLocation = (value: string) =>
    value.trim().normalize('NFKC').toLocaleLowerCase('en');
  const location = request.location === null ? null : normalizeLocation(request.location);
  const canonicalLocation =
    location === null ? null : (configured?.locationAliases[location] ?? location);
  const inArea =
    canonicalLocation !== null &&
    tenant.serviceAreas.some(
      (area) => normalizeLocation(area) === normalizeLocation(canonicalLocation),
    );
  if (location !== null && !inArea) {
    handoff = true;
    blockApproval = true;
    add(
      'outside_service_area',
      'Outside the service area',
      `Configured service areas: ${tenant.serviceAreas.join(', ')}. Confirm this location with the team.`,
    );
  }
  if (request.intent === 'quote' && location === null) missing.add('Service / delivery location');
  if (request.availabilityRequested)
    add(
      'availability',
      'Availability needs confirmation',
      'The catalogue contains prices, not live availability or confirmed delivery dates.',
    );
  if (request.discountRequested && request.discountPercent === null)
    add(
      'discount_unspecified',
      'Discount requested; none applied',
      'Ask the named approver about a discount. A request for a better price is not a discount percentage.',
    );
  const percent = scaled(request.discountPercent ?? '0');
  if (percent > 0n) {
    add(
      'custom_discount',
      'Custom deal needs named approval',
      `Requested discount: ${normalizeDigits(request.discountPercent ?? '0')}%.`,
    );
    if (percent >= BigInt(tenant.discountThresholdBasisPoints) * 100n)
      add(
        'discount_threshold',
        'Discount meets the approval threshold',
        `Requested discount is at or above ${tenant.discountThresholdBasisPoints / 100}%.`,
      );
  }
  if (request.intent === 'quote' && request.lines.length === 0) missing.add('Product and quantity');
  const lines: Quote['lines'] = [];
  let subtotal = 0n;
  let stageArea = 0n,
    screenArea = 0n,
    tentRequested = false;
  const seen = new Set<string>();
  const rows = new Map(context.rows.map((row) => [row.id, row]));
  const addLine = (
    row: typeof catalogueRows.$inferSelect,
    rate: bigint,
    quantity: bigint,
    periods: bigint,
    unit: string,
  ) => {
    const amount = roundHalfUp(rate * quantity * periods, SCALE * SCALE);
    subtotal += amount;
    lines.push({
      sku: row.id,
      label: row.item,
      unitPriceMinor: safeMinor(rate),
      quantity: Number(quantity) / Number(SCALE),
      periods: Number(periods) / Number(SCALE),
      unit,
      lineTotalMinor: safeMinor(amount),
    });
  };
  let quote: Quote | null = null;
  try {
    for (const line of request.lines) {
      const row = line.sku === null ? undefined : rows.get(line.sku);
      if (!row) {
        missing.add(`Catalogue match: ${line.description}`);
        add(
          'unknown_product',
          'Product needs clarification',
          'No price or substitute is invented for an unknown product.',
          'tenant catalogue',
        );
        continue;
      }
      if (
        seen.has(row.id) ||
        row.id === configured?.delivery.sku ||
        row.id === configured?.crew?.sku
      ) {
        blockApproval = true;
        add(
          'invalid_line',
          'Line items need correction',
          'Duplicate products and manually supplied mandatory fees are not accepted. Fees are added by code.',
          'structured request',
        );
        continue;
      }
      seen.add(row.id);
      if (line.quantity === null) {
        missing.add(`Quantity: ${row.item}`);
        continue;
      }
      let quantity = scaled(line.quantity);
      const periods =
        line.mode === 'buy' ? SCALE : line.periods === null ? null : scaled(line.periods);
      const crew = configured?.crew;
      if (crew && row.id === crew.screenSku && line.unit !== 'm2') {
        blockApproval = true;
        missing.add('Screen area in m²');
        add(
          'invalid_unit',
          'Screen area is required',
          'Screen pricing uses square metres, not a count of screens.',
          row.id,
        );
        continue;
      }
      if (line.unit === 'item' && quantity % SCALE !== 0n) {
        blockApproval = true;
        add(
          'invalid_unit',
          'Whole product units are required',
          'A fraction of a counted product or deck cannot be quoted.',
          row.id,
        );
        continue;
      }
      if (crew && row.id === crew.stageSku) {
        const area = line.unit === 'm2' ? quantity : quantity * BigInt(crew.stageDeckAreaM2);
        stageArea += area;
        if (line.unit === 'm2') {
          const deckArea = BigInt(crew.stageDeckAreaM2) * SCALE;
          quantity = ((area + deckArea - 1n) / deckArea) * SCALE;
          add(
            'stage_decks',
            'Stage area converted to source decks',
            `${normalizeDigits(line.quantity)} m² uses ${quantity / SCALE} decks of ${crew.stageDeckAreaM2} m². Layout still needs confirmation.`,
            row.id,
          );
        }
      } else if (crew && row.id === crew.screenSku) {
        screenArea += quantity;
      } else if (line.unit !== 'item' || quantity % SCALE !== 0n) {
        blockApproval = true;
        add(
          'invalid_unit',
          'Product quantity needs correction',
          'Counted products require whole units; only configured area products use m².',
          row.id,
        );
        continue;
      }
      if (crew && row.id === crew.tentSku) tentRequested = true;
      if (periods === null) {
        missing.add(`Rental duration: ${row.item}`);
        continue;
      }
      if (line.mode === 'month' && configured) {
        if (
          (configured.minimumRentalMonths !== null &&
            periods < BigInt(configured.minimumRentalMonths) * SCALE) ||
          (configured.maximumRentalMonths !== null &&
            periods > BigInt(configured.maximumRentalMonths) * SCALE)
        ) {
          handoff = true;
          blockApproval = true;
          add(
            'rental_duration',
            'Rental duration needs a manager',
            `Configured monthly rental range: ${configured.minimumRentalMonths ?? 'no minimum'}–${configured.maximumRentalMonths ?? 'no maximum'} months.`,
            'tenant rental policy',
          );
        }
      }
      const rate =
        line.mode === 'buy'
          ? row.buyMinor
          : line.mode === 'month'
            ? row.rentPerMonthMinor
            : row.perDayMinor;
      if (rate === null) {
        blockApproval = true;
        add(
          'unsupported_rate',
          'Requested pricing basis is unavailable',
          'The cited row has no price for this purchase or rental basis.',
          row.id,
        );
        continue;
      }
      if (line.mode === 'buy' && line.periods !== null && scaled(line.periods) !== SCALE) {
        blockApproval = true;
        add(
          'invalid_period',
          'Purchase period must be one',
          'Purchase prices cannot be multiplied by a rental duration.',
          row.id,
        );
        continue;
      }
      const unit =
        line.mode === 'buy'
          ? 'item / purchase'
          : crew?.stageSku === row.id
            ? 'deck / day'
            : line.unit === 'm2'
              ? 'm² / day'
              : `item / ${line.mode}`;
      addLine(row, rate, quantity, periods, unit);
    }
    const crew = configured?.crew;
    if (
      crew &&
      (stageArea > BigInt(crew.stageThresholdM2) * SCALE ||
        screenArea > BigInt(crew.screenThresholdM2) * SCALE ||
        tentRequested)
    ) {
      const row = rows.get(crew.sku);
      if (!row || row.perShiftMinor === null) {
        blockApproval = true;
        add(
          'missing_crew_rate',
          'Required crew rate is unavailable',
          'The order cannot be approved without the configured crew rate.',
        );
      } else {
        addLine(row, row.perShiftMinor, SCALE, BigInt(crew.shiftsPerOrder) * SCALE, 'crew / shift');
        add(
          'crew_required',
          'Crew required',
          'Configured stage/screen/tent rule adds one crew allocation per order.',
          crew.sku,
        );
      }
    }
    if (request.intent === 'quote' && request.delivery !== 'collection') {
      if (request.delivery === 'unknown') missing.add('Delivery or collection arrangement');
      if (request.delivery === 'requested' && inArea && configured) {
        const trips = configured.delivery.basis === 'order' ? 1 : request.deliveryTrips;
        const row = rows.get(configured.delivery.sku);
        if (trips === null) missing.add('Number of delivery / collection trips');
        else if (!row || row.flatMinor === null) {
          blockApproval = true;
          add(
            'missing_delivery_rate',
            'Delivery rate unavailable',
            'The configured delivery fee is missing.',
          );
        } else
          addLine(
            row,
            row.flatMinor,
            BigInt(trips) * SCALE,
            SCALE,
            configured.delivery.basis === 'order' ? 'delivery / order' : 'delivery / trip',
          );
      }
    }
    const discount = roundHalfUp(subtotal * percent, 100n * SCALE);
    const net = subtotal - discount;
    const vat = roundHalfUp(net * BigInt(tenant.vatBasisPoints), 10_000n);
    const total = net + vat;
    if (request.intent === 'quote' && lines.length > 0) {
      if (missing.size === 0 && net < tenant.minimumOrderMinor) {
        handoff = true;
        blockApproval = true;
        add(
          'minimum_order',
          'Below the minimum order',
          `Minimum before VAT, after discount: ${tenant.currency} ${formatMinor(tenant.minimumOrderMinor)}.`,
          'tenant minimum-order policy',
        );
      }
      if (request.budgetMinor !== null && total > BigInt(request.budgetMinor))
        add(
          'budget_exceeded',
          'Estimate exceeds the customer budget',
          `Total exceeds the budget by ${tenant.currency} ${formatMinor(total - BigInt(request.budgetMinor))}; no extra discount is assumed.`,
          'customer budget',
        );
      quote = {
        currency: tenant.currency,
        vatPercent: tenant.vatBasisPoints / 100,
        lines,
        subtotalMinor: safeMinor(subtotal),
        discountMinor: safeMinor(discount),
        vatMinor: safeMinor(vat),
        totalMinor: safeMinor(total),
        complete: missing.size === 0 && !blockApproval,
        note: missing.size
          ? `Partial estimate. Still needed: ${[...missing].join('; ')}. Unresolved fees/items are excluded.`
          : 'Configured fees included. Availability and scheduling remain subject to named confirmation.',
      };
    }
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Amount exceeds the supported range.')
      throw error;
    quote = null;
    blockApproval = true;
    add(
      'amount_out_of_range',
      'Amount is outside the supported range',
      'No unsafe or rounded-down amount can be quoted.',
    );
  }
  if (handoff || request.intent !== 'quote') quote = null;
  if (quote)
    add(
      'firm_quote',
      'Firm price needs named approval',
      'Catalogue prices and totals were recomputed by code. A person must approve the commercial reply.',
      `catalogue ${catalogue.version}`,
    );
  const verifiedFaq =
    request.intent === 'faq' &&
    request.language === 'English' &&
    request.faqIndex !== null &&
    tenant.faq[request.faqIndex] !== undefined &&
    request.lines.length === 0 &&
    !request.availabilityRequested &&
    !request.discountRequested &&
    request.discountPercent === null &&
    missing.size === 0 &&
    !blockApproval &&
    !handoff;
  let disposition: Assessment['disposition'] = 'needs_approval';
  if (request.intent === 'spam') {
    disposition = 'drop';
    blockApproval = true;
  } else if (handoff) {
    disposition = 'hand_off';
    blockApproval = true;
  } else if (verifiedFaq && tenant.autoSend === 'low_risk_only' && context.trust === 'autonomous')
    disposition = 'auto_send';
  else {
    if (!verifiedFaq)
      add(
        'review_required',
        'Human review required',
        'Only a verified non-committing FAQ reply can qualify as low risk.',
      );
    if (tenant.autoSend === 'off')
      add(
        'auto_send_off',
        'Automatic sending is disabled',
        'This business requires named approval for every reply.',
      );
    if (context.trust !== 'autonomous')
      add(
        'supervised',
        'Officer remains supervised',
        'Autonomous trust has not been established for this business/version.',
      );
  }
  const output = {
    engineVersion: ENGINE_VERSION,
    catalogueVersion: catalogue.version,
    request,
    disposition,
    blockApproval,
    quote,
    reasons,
    missing: [...missing],
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
