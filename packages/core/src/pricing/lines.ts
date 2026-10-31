import { normalizeDigits, roundHalfUp, SCALE, safeMinor, scaled } from './decimal.ts';
import type { Quote } from './model.ts';
import { addReason } from './policy.ts';
import type { CatalogueRow, Evaluation } from './types.ts';

export type PricedOrder = {
  lines: Quote['lines'];
  subtotal: bigint;
  stageArea: bigint;
  screenArea: bigint;
  tentRequested: boolean;
};

export function priceProducts(state: Evaluation): PricedOrder {
  const { request, rules: configured, rows } = state;
  const order: PricedOrder = {
    lines: [],
    subtotal: 0n,
    stageArea: 0n,
    screenArea: 0n,
    tentRequested: false,
  };
  const seen = new Set<string>();
  for (const line of request.lines) {
    const row = line.sku === null ? undefined : rows.get(line.sku);
    if (!row) {
      state.missing.add(`Catalogue match: ${line.description}`);
      addReason(
        state,
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
      state.blockApproval = true;
      addReason(
        state,
        'invalid_line',
        'Line items need correction',
        'Duplicate products and manually supplied mandatory fees are not accepted. Fees are added by code.',
        'structured request',
      );
      continue;
    }
    seen.add(row.id);
    if (line.quantity === null) {
      state.missing.add(`Quantity: ${row.item}`);
      continue;
    }
    let quantity = scaled(line.quantity);
    const periods =
      line.mode === 'buy' ? SCALE : line.periods === null ? null : scaled(line.periods);
    const crew = configured?.crew;
    if (crew && row.id === crew.screenSku && line.unit !== 'm2') {
      state.blockApproval = true;
      state.missing.add('Screen area in m²');
      addReason(
        state,
        'invalid_unit',
        'Screen area is required',
        'Screen pricing uses square metres, not a count of screens.',
        row.id,
      );
      continue;
    }
    if (line.unit === 'item' && quantity % SCALE !== 0n) {
      state.blockApproval = true;
      addReason(
        state,
        'invalid_unit',
        'Whole product units are required',
        'A fraction of a counted product or deck cannot be quoted.',
        row.id,
      );
      continue;
    }
    if (crew && row.id === crew.stageSku) {
      const area = line.unit === 'm2' ? quantity : quantity * BigInt(crew.stageDeckAreaM2);
      order.stageArea += area;
      if (line.unit === 'm2') {
        const deckArea = BigInt(crew.stageDeckAreaM2) * SCALE;
        quantity = ((area + deckArea - 1n) / deckArea) * SCALE;
        addReason(
          state,
          'stage_decks',
          'Stage area converted to source decks',
          `${normalizeDigits(line.quantity)} m² uses ${quantity / SCALE} decks of ${crew.stageDeckAreaM2} m². Layout still needs confirmation.`,
          row.id,
        );
      }
    } else if (crew && row.id === crew.screenSku) {
      order.screenArea += quantity;
    } else if (line.unit !== 'item' || quantity % SCALE !== 0n) {
      state.blockApproval = true;
      addReason(
        state,
        'invalid_unit',
        'Product quantity needs correction',
        'Counted products require whole units; only configured area products use m².',
        row.id,
      );
      continue;
    }
    if (crew && row.id === crew.tentSku) order.tentRequested = true;
    if (periods === null) {
      state.missing.add(`Rental duration: ${row.item}`);
      continue;
    }
    if (line.mode === 'month' && configured) {
      if (
        (configured.minimumRentalMonths !== null &&
          periods < BigInt(configured.minimumRentalMonths) * SCALE) ||
        (configured.maximumRentalMonths !== null &&
          periods > BigInt(configured.maximumRentalMonths) * SCALE)
      ) {
        state.handoff = true;
        state.blockApproval = true;
        addReason(
          state,
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
      state.blockApproval = true;
      addReason(
        state,
        'unsupported_rate',
        'Requested pricing basis is unavailable',
        'The cited row has no price for this purchase or rental basis.',
        row.id,
      );
      continue;
    }
    if (line.mode === 'buy' && line.periods !== null && scaled(line.periods) !== SCALE) {
      state.blockApproval = true;
      addReason(
        state,
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
    addLine(order, row, rate, quantity, periods, unit);
  }
  return order;
}

export function addLine(
  order: PricedOrder,
  row: CatalogueRow,
  rate: bigint,
  quantity: bigint,
  periods: bigint,
  unit: string,
) {
  const amount = roundHalfUp(rate * quantity * periods, SCALE * SCALE);
  order.subtotal += amount;
  order.lines.push({
    sku: row.id,
    label: row.item,
    unitPriceMinor: safeMinor(rate),
    quantity: Number(quantity) / Number(SCALE),
    periods: Number(periods) / Number(SCALE),
    unit,
    lineTotalMinor: safeMinor(amount),
  });
}
