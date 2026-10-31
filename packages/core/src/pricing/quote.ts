import { formatMinor, roundHalfUp, SCALE, safeMinor } from './decimal.ts';
import { addLine, priceProducts } from './lines.ts';
import type { Quote } from './model.ts';
import { addReason } from './policy.ts';
import type { Evaluation } from './types.ts';

export function calculateQuote(state: Evaluation): Quote | null {
  const { request, rules: configured, rows } = state;
  const { tenant } = state.context;
  const order = priceProducts(state);
  let quote: Quote | null = null;

  const crew = configured?.crew;
  if (
    crew &&
    (order.stageArea > BigInt(crew.stageThresholdM2) * SCALE ||
      order.screenArea > BigInt(crew.screenThresholdM2) * SCALE ||
      order.tentRequested)
  ) {
    const row = rows.get(crew.sku);
    if (!row || row.perShiftMinor === null) {
      state.blockApproval = true;
      addReason(
        state,
        'missing_crew_rate',
        'Required crew rate is unavailable',
        'The order cannot be approved without the configured crew rate.',
      );
    } else {
      addLine(
        order,
        row,
        row.perShiftMinor,
        SCALE,
        BigInt(crew.shiftsPerOrder) * SCALE,
        'crew / shift',
      );
      addReason(
        state,
        'crew_required',
        'Crew required',
        'Configured stage/screen/tent rule adds one crew allocation per order.',
        crew.sku,
      );
    }
  }
  if (request.intent === 'quote' && request.delivery !== 'collection') {
    if (request.delivery === 'unknown') state.missing.add('Delivery or collection arrangement');
    if (request.delivery === 'requested' && state.inArea && configured) {
      const trips = configured.delivery.basis === 'order' ? 1 : request.deliveryTrips;
      const row = rows.get(configured.delivery.sku);
      if (trips === null) state.missing.add('Number of delivery / collection trips');
      else if (!row || row.flatMinor === null) {
        state.blockApproval = true;
        addReason(
          state,
          'missing_delivery_rate',
          'Delivery rate unavailable',
          'The configured delivery fee is missing.',
        );
      } else
        addLine(
          order,
          row,
          row.flatMinor,
          BigInt(trips) * SCALE,
          SCALE,
          configured.delivery.basis === 'order' ? 'delivery / order' : 'delivery / trip',
        );
    }
  }
  const discount = roundHalfUp(order.subtotal * state.discountPercent, 100n * SCALE);
  const net = order.subtotal - discount;
  const vat = roundHalfUp(net * BigInt(tenant.vatBasisPoints), 10_000n);
  const total = net + vat;
  if (request.intent === 'quote' && order.lines.length > 0) {
    if (state.missing.size === 0 && net < tenant.minimumOrderMinor) {
      state.handoff = true;
      state.blockApproval = true;
      addReason(
        state,
        'minimum_order',
        'Below the minimum order',
        `Minimum before VAT, after discount: ${tenant.currency} ${formatMinor(tenant.minimumOrderMinor)}.`,
        'tenant minimum-order policy',
      );
    }
    if (request.budgetMinor !== null && total > BigInt(request.budgetMinor))
      addReason(
        state,
        'budget_exceeded',
        'Estimate exceeds the customer budget',
        `Total exceeds the budget by ${tenant.currency} ${formatMinor(total - BigInt(request.budgetMinor))}; no extra discount is assumed.`,
        'customer budget',
      );
    quote = {
      currency: tenant.currency,
      vatPercent: tenant.vatBasisPoints / 100,
      lines: order.lines,
      subtotalMinor: safeMinor(order.subtotal),
      discountMinor: safeMinor(discount),
      vatMinor: safeMinor(vat),
      totalMinor: safeMinor(total),
      complete: state.missing.size === 0 && !state.blockApproval,
      note: state.missing.size
        ? `Partial estimate. Still needed: ${[...state.missing].join('; ')}. Unresolved fees/items are excluded.`
        : 'Configured fees included. Availability and scheduling remain subject to named confirmation.',
    };
  }

  return quote;
}
