import { expect, test } from 'bun:test';
import { loadSeed } from '@trustdesk/db/seed';
import { scaledInteger } from '../../../db/src/seed-model.ts';
import { formatMinor, roundHalfUp, scaled } from './decimal.ts';
import { evaluateRequest, type PricingContext } from './evaluate.ts';
import type { Assessment, PricingRequest } from './model.ts';
import { renderReply, sameCommercialFacts } from './render.ts';

const source = await loadSeed();
const ruleSource = await Bun.file(
  new URL('../../../../seed/commercial-rules.json', import.meta.url),
).json();
function context(id = 'qamar'): PricingContext {
  const business = source.businesses.find((b) => b.id === id);
  const book = source.catalogues.find((b) => b.tenant === id);
  if (!business || !book) throw new Error('Missing test source');
  return {
    tenant: {
      id,
      name: business.name,
      shortName: id,
      location: business.location,
      timezone: id === 'qamar' ? 'Asia/Dubai' : 'Asia/Riyadh',
      sells: business.sells,
      currency: business.currency,
      currencyMinorUnits: 2,
      vatBasisPoints: Number(scaledInteger(business.vat_rate, 4)),
      languages: business.languages,
      autoSend: business.auto_send,
      discountThresholdBasisPoints: Number(
        scaledInteger(business.policy.discount_needs_approval_at_pct, 2),
      ),
      serviceAreas: business.policy.service_area,
      outsideServiceArea: 'hand_off',
      minimumOrderMinor: scaledInteger(business.policy.minimum_order_before_vat ?? 0, 2),
      faq: business.faq,
      commercialRules: ruleSource[id],
      createdAt: new Date(0),
    },
    catalogue: {
      tenantId: id,
      version: book.version,
      source: 'test source',
      sourceHash: 'a'.repeat(64),
      createdAt: new Date(0),
    },
    rows: book.rows.map((r) => ({
      tenantId: id,
      version: book.version,
      id: r.id,
      item: r.item,
      itemArabic: r.item_ar ?? null,
      rentPerMonthMinor: r.rent_per_month === undefined ? null : scaledInteger(r.rent_per_month, 2),
      buyMinor: r.buy === undefined ? null : scaledInteger(r.buy, 2),
      perDayMinor: r.per_day === undefined ? null : scaledInteger(r.per_day, 2),
      perShiftMinor: r.per_shift === undefined ? null : scaledInteger(r.per_shift, 2),
      flatMinor: r.flat === undefined ? null : scaledInteger(r.flat, 2),
    })),
    trust: 'supervised',
  };
}
const base: PricingRequest = {
  intent: 'quote',
  language: 'English',
  lines: [
    {
      sku: 'Q-PHN-001',
      description: 'iPhone 16',
      quantity: '5',
      unit: 'item',
      mode: 'buy',
      periods: '1',
    },
  ],
  location: 'Dubai',
  delivery: 'collection',
  deliveryTrips: null,
  discountRequested: false,
  discountPercent: null,
  budgetMinor: null,
  availabilityRequested: false,
  faqIndex: null,
  missing: [],
};
const codes = (result: Assessment) => result.reasons.map((r) => r.code);

test('Qamar source purchase, Arabic digits and exact VAT produce AED 17,844.75', () => {
  const result = evaluateRequest(context(), {
    ...base,
    lines: [{ ...base.lines[0], quantity: '٥' }],
  });
  expect(result.quote).toMatchObject({
    subtotalMinor: 1699500,
    discountMinor: 0,
    vatMinor: 84975,
    totalMinor: 1784475,
    complete: true,
  });
  expect(result.disposition).toBe('needs_approval');
  expect(codes(result)).toContain('firm_quote');
  expect(scaled('۱۲٫۵')).toBe(125000n);
});

test('line, discount and invoice VAT rounding is half-up without binary floats', () => {
  const ctx = context();
  ctx.rows = ctx.rows.map((r) => (r.id === 'Q-PHN-001' ? { ...r, buyMinor: 101n } : r));
  const result = evaluateRequest(ctx, {
    ...base,
    lines: [{ ...base.lines[0], quantity: '1' }],
    discountPercent: '50',
  });
  expect(result.quote).toMatchObject({
    subtotalMinor: 101,
    discountMinor: 51,
    vatMinor: 3,
    totalMinor: 53,
  });
  expect(roundHalfUp(1n, 2n)).toBe(1n);
  expect(formatMinor(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
  const fractional = context('rimal');
  fractional.tenant.minimumOrderMinor = 0n;
  const fractionQuote = evaluateRequest(fractional, {
    ...base,
    location: 'Riyadh',
    lines: [
      {
        sku: 'R-LED-001',
        description: 'Screen',
        quantity: '1.0001',
        unit: 'm2',
        mode: 'day',
        periods: '1',
      },
    ],
  });
  expect(fractionQuote.quote?.lines[0]?.lineTotalMinor).toBe(35004);
  expect(roundHalfUp(1004n, 1000n)).toBe(1n);
});

test('better-price requests never invent a discount and monthly delivery is charged once', () => {
  const result = evaluateRequest(context(), {
    ...base,
    lines: [
      {
        sku: 'Q-LAP-001',
        description: 'MacBook Air',
        quantity: '30',
        unit: 'item',
        mode: 'month',
        periods: '3',
      },
    ],
    location: 'JLT',
    delivery: 'requested',
    discountRequested: true,
  });
  expect(result.quote).toMatchObject({
    subtotalMinor: 1635000,
    discountMinor: 0,
    vatMinor: 81750,
    totalMinor: 1716750,
  });
  expect(result.quote?.lines.find((l) => l.sku === 'Q-SVC-001')).toMatchObject({
    quantity: 1,
    periods: 1,
    lineTotalMinor: 15000,
  });
  expect(codes(result)).toContain('discount_unspecified');
});

test('discount approval uses each configured inclusive threshold', () => {
  for (const id of ['qamar', 'rimal']) {
    const ctx = context(id);
    const threshold = ctx.tenant.discountThresholdBasisPoints / 100;
    const request =
      id === 'qamar'
        ? base
        : {
            ...base,
            location: 'Riyadh',
            lines: [
              {
                sku: 'R-LED-001',
                description: 'Screen',
                quantity: '6',
                unit: 'm2',
                mode: 'day',
                periods: '2',
              },
            ],
          };
    expect(
      codes(evaluateRequest(ctx, { ...request, discountPercent: String(threshold) })),
    ).toContain('discount_threshold');
    expect(
      codes(evaluateRequest(ctx, { ...request, discountPercent: String(threshold - 0.01) })),
    ).not.toContain('discount_threshold');
  }
});

test('stage 6×4m converts to twelve 2m² source decks, with one crew shift', () => {
  const result = evaluateRequest(context('rimal'), {
    ...base,
    location: 'الرياض',
    lines: [
      {
        sku: 'R-STG-001',
        description: '6x4m stage',
        quantity: '24',
        unit: 'm2',
        mode: 'day',
        periods: '2',
      },
    ],
  });
  expect(result.quote?.lines).toMatchObject([
    { sku: 'R-STG-001', quantity: 12, periods: 2, lineTotalMinor: 288000 },
    { sku: 'R-CRW-001', quantity: 1, periods: 1, lineTotalMinor: 220000 },
  ]);
  expect(result.quote?.totalMinor).toBe(584200);
  expect(codes(result)).toContain('stage_decks');
});

test('crew triggers strictly above stage/screen thresholds or for any tent, once per order', () => {
  const rimal = context('rimal');
  const screen = {
    sku: 'R-LED-001',
    description: 'Screen',
    quantity: '6',
    unit: 'm2',
    mode: 'day',
    periods: '1',
  };
  expect(
    codes(evaluateRequest(rimal, { ...base, location: 'Riyadh', lines: [screen] })),
  ).not.toContain('crew_required');
  expect(
    codes(
      evaluateRequest(rimal, {
        ...base,
        location: 'Riyadh',
        lines: [{ ...screen, quantity: '6.0001' }],
      }),
    ),
  ).toContain('crew_required');
  const stage = {
    sku: 'R-STG-001',
    description: 'Stage',
    quantity: '12',
    unit: 'm2',
    mode: 'day',
    periods: '1',
  };
  expect(
    codes(evaluateRequest(rimal, { ...base, location: 'Riyadh', lines: [stage] })),
  ).not.toContain('crew_required');
  const result = evaluateRequest(rimal, {
    ...base,
    location: 'Riyadh',
    lines: [
      { ...stage, quantity: '13' },
      { ...screen, quantity: '12' },
      {
        sku: 'R-TNT-001',
        description: 'Tent',
        quantity: '1',
        unit: 'item',
        mode: 'day',
        periods: '3',
      },
    ],
  });
  expect(result.quote?.lines.filter((l) => l.sku === 'R-CRW-001')).toHaveLength(1);
  expect(result.quote?.lines.find((l) => l.sku === 'R-STG-001')?.quantity).toBe(7);
});

test('Rimal LED budget case totals SAR 12,604 before unresolved delivery', () => {
  const result = evaluateRequest(context('rimal'), {
    ...base,
    location: 'Riyadh',
    delivery: 'unknown',
    budgetMinor: 900000,
    lines: [
      {
        sku: 'R-LED-001',
        description: 'LED',
        quantity: '12',
        unit: 'm2',
        mode: 'day',
        periods: '2',
      },
      {
        sku: 'R-MIC-001',
        description: 'Mics',
        quantity: '2',
        unit: 'item',
        mode: 'day',
        periods: '2',
      },
    ],
  });
  expect(result.quote).toMatchObject({
    subtotalMinor: 1096000,
    vatMinor: 164400,
    totalMinor: 1260400,
    complete: false,
  });
  expect(codes(result)).toContain('budget_exceeded');
});

test('Rimal delivery needs a confirmed trip count; it is never multiplied by event days', () => {
  const request = {
    ...base,
    location: 'Riyadh',
    delivery: 'requested',
    lines: [
      {
        sku: 'R-LED-001',
        description: 'LED',
        quantity: '6',
        unit: 'm2',
        mode: 'day',
        periods: '3',
      },
    ],
  };
  expect(evaluateRequest(context('rimal'), request).missing).toContain(
    'Number of delivery / collection trips',
  );
  const result = evaluateRequest(context('rimal'), { ...request, deliveryTrips: 2 });
  expect(result.quote?.lines.find((l) => l.sku === 'R-DLV-001')).toMatchObject({
    quantity: 2,
    periods: 1,
    lineTotalMinor: 90000,
  });
});

test('minimum order is tested after discount and before VAT; partial estimates do not decide it', () => {
  const request = {
    ...base,
    location: 'Riyadh',
    lines: [
      {
        sku: 'R-AUD-001',
        description: 'Audio',
        quantity: '1',
        unit: 'item',
        mode: 'day',
        periods: '2',
      },
    ],
    discountPercent: '30',
  };
  const result = evaluateRequest(context('rimal'), request);
  expect(result.disposition).toBe('hand_off');
  expect(result.blockApproval).toBe(true);
  expect(codes(result)).toContain('minimum_order');
  expect(
    codes(evaluateRequest(context('rimal'), { ...request, missing: ['Other equipment'] })),
  ).not.toContain('minimum_order');
});

test('outside-area and rentals outside the configured month range require handoff', () => {
  expect(evaluateRequest(context(), { ...base, location: 'Abu Dhabi' })).toMatchObject({
    disposition: 'hand_off',
    blockApproval: true,
    quote: null,
  });
  for (const periods of ['0.5', '13'])
    expect(
      evaluateRequest(context(), { ...base, lines: [{ ...base.lines[0], mode: 'month', periods }] })
        .disposition,
    ).toBe('hand_off');
});

test('unknown or foreign SKUs are never silently substituted; missing details stay explicit', () => {
  const result = evaluateRequest(context('rimal'), {
    ...base,
    location: 'Riyadh',
    lines: [{ ...base.lines[0], description: 'MacBook Air' }],
  });
  expect(result.quote).toBeNull();
  expect(codes(result)).toContain('unknown_product');
  const missing = evaluateRequest(context(), {
    ...base,
    lines: [{ ...base.lines[0], quantity: null }],
  });
  expect(missing.missing.some((m) => m.startsWith('Quantity:'))).toBe(true);
  expect(missing.quote).toBeNull();
});

test('bad units, duplicate lines, manual fees and unsupported bases block approval', () => {
  const requests = [
    { ...base, lines: [base.lines[0], base.lines[0]] },
    { ...base, lines: [{ ...base.lines[0], quantity: '1.5' }] },
    { ...base, lines: [{ ...base.lines[0], mode: 'day' }] },
    { ...base, lines: [{ ...base.lines[0], sku: 'Q-SVC-001' }] },
    { ...base, lines: [{ ...base.lines[0], periods: '2' }] },
  ];
  for (const request of requests)
    expect(evaluateRequest(context(), request).blockApproval).toBe(true);
  expect(() =>
    evaluateRequest(context(), { ...base, lines: [{ ...base.lines[0], quantity: '-1' }] }),
  ).toThrow();
  expect(() => evaluateRequest(context(), { ...base, discountPercent: '100.0001' })).toThrow();
  expect(() =>
    evaluateRequest(context(), { ...base, lines: [{ ...base.lines[0], quantity: '1.00001' }] }),
  ).toThrow();
});

test('unsafe monetary ranges fail closed and cross-tenant contexts are rejected', () => {
  const ctx = context();
  ctx.rows = ctx.rows.map((r) =>
    r.id === 'Q-PHN-001' ? { ...r, buyMinor: 9_000_000_000_000_000n } : r,
  );
  expect(evaluateRequest(ctx, base)).toMatchObject({ blockApproval: true, quote: null });
  expect(() => evaluateRequest({ ...context(), rows: context('rimal').rows }, base)).toThrow(
    'exactly one business',
  );
  expect(
    evaluateRequest({ ...context(), tenant: { ...context().tenant, commercialRules: null } }, base)
      .disposition,
  ).toBe('hand_off');
});

test('auto-send requires a verified FAQ, tenant enablement and autonomous trust together', () => {
  const faq = { ...base, intent: 'faq', lines: [], faqIndex: 0 };
  expect(evaluateRequest(context(), faq).disposition).toBe('needs_approval');
  expect(evaluateRequest({ ...context(), trust: 'autonomous' }, faq).disposition).toBe('auto_send');
  expect(
    evaluateRequest({ ...context('rimal'), trust: 'autonomous' }, { ...faq, location: 'Riyadh' })
      .disposition,
  ).toBe('needs_approval');
  expect(
    evaluateRequest({ ...context(), trust: 'autonomous' }, { ...faq, availabilityRequested: true })
      .disposition,
  ).toBe('needs_approval');
  expect(
    evaluateRequest({ ...context(), trust: 'autonomous' }, { ...faq, faqIndex: 99 }).disposition,
  ).toBe('needs_approval');
  expect(evaluateRequest(context(), { ...base, intent: 'support' }).disposition).toBe('hand_off');
  expect(evaluateRequest(context(), { ...base, intent: 'spam' }).disposition).toBe('drop');
});

test('controlled English/Arabic reply uses the computed total; edits cannot change numeric facts', () => {
  const english = renderReply(evaluateRequest(context(), base), []);
  const arabic = renderReply(evaluateRequest(context(), { ...base, language: 'Arabic' }), []);
  expect(english).toContain('AED 17844.75');
  expect(arabic).toContain('AED 17844.75');
  expect(sameCommercialFacts(arabic, `${arabic} يرجى تأكيد العنوان.`)).toBe(true);
  expect(sameCommercialFacts(english, english.replace('17844.75', '1.00'))).toBe(false);
  expect(sameCommercialFacts(english, english.replace('AED', 'SAR'))).toBe(false);
});

test('missing mandatory fee rows or rates block approval without inventing a charge', () => {
  const cases = [
    {
      tenantId: 'qamar',
      feeSku: 'Q-SVC-001',
      rate: 'flatMinor' as const,
      reason: 'missing_delivery_rate',
      request: { ...base, delivery: 'requested' },
    },
    {
      tenantId: 'rimal',
      feeSku: 'R-CRW-001',
      rate: 'perShiftMinor' as const,
      reason: 'missing_crew_rate',
      request: {
        ...base,
        location: 'Riyadh',
        lines: [{ ...base.lines[0], sku: 'R-STG-001', quantity: '24', unit: 'm2', mode: 'day' }],
      },
    },
  ];
  for (const scenario of cases) {
    for (const removeRow of [false, true]) {
      const ctx = context(scenario.tenantId);
      ctx.tenant.minimumOrderMinor = 0n;
      ctx.rows = removeRow
        ? ctx.rows.filter((row) => row.id !== scenario.feeSku)
        : ctx.rows.map((row) =>
            row.id === scenario.feeSku ? { ...row, [scenario.rate]: null } : row,
          );
      const result = evaluateRequest(ctx, scenario.request);
      expect(result.blockApproval).toBe(true);
      expect(result.quote?.complete).toBe(false);
      expect(codes(result)).toContain(scenario.reason);
      expect(result.quote?.lines.some((line) => line.sku === scenario.feeSku)).toBe(false);
    }
  }
});
