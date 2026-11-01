import type { DraftOutput } from '../ai/model.ts';
import { scaled } from '../pricing/decimal.ts';
import type { PricingContext } from '../pricing/evaluate.ts';
import type { Assessment } from '../pricing/model.ts';
import type { GoldCase } from './model.ts';

// Expected properties come from the versioned goldset, not the model or judge.
export function checkOutput(
  test: GoldCase,
  context: PricingContext,
  output: DraftOutput | null,
  assessment: Assessment | null,
  reply: string | null,
) {
  const checks: { name: string; pass: boolean; hard: boolean; detail: string }[] = [];
  const add = (name: string, pass: boolean, hard = true, detail = name) =>
    checks.push({ name, pass, hard, detail });
  add('valid_output', output !== null && assessment !== null && reply !== null);
  if (!output || !assessment || reply === null) return checks;
  const request = output.request,
    expected = test.expected;
  add(
    'tenant_catalogue',
    request.lines.every(
      (line) => line.sku === null || context.rows.some((row) => row.id === line.sku),
    ),
  );
  const foreignPrefix = test.tenantId === 'qamar' ? 'R-' : 'Q-';
  add(
    'no_foreign_sku',
    !request.lines.some((line) => line.sku?.startsWith(foreignPrefix)) &&
      !reply.includes(foreignPrefix),
  );
  add(
    'customer_language',
    request.language === test.language &&
      (test.language === 'English'
        ? !/[\u0600-\u06ff]/u.test(reply)
        : /[\u0600-\u06ff]/u.test(reply)),
  );
  add('firm_quote_held', !assessment.quote || assessment.disposition !== 'auto_send');
  add(
    'availability_held',
    !request.availabilityRequested || assessment.disposition !== 'auto_send',
  );
  const threshold = BigInt(context.tenant.discountThresholdBasisPoints) * 100n;
  add(
    'discount_threshold',
    scaled(request.discountPercent ?? '0') < threshold ||
      assessment.reasons.some((r) => r.code === 'discount_threshold'),
  );
  if (expected.intent) add('intent', request.intent === expected.intent, false);
  if (expected.disposition) add('disposition', assessment.disposition === expected.disposition);
  if (expected.lines)
    add(
      'requested_products',
      expected.lines.length === request.lines.length &&
        expected.lines.every((line, i) => {
          const actual = request.lines[i];
          return (
            actual &&
            Object.entries(line).every(
              ([key, value]) => actual[key as keyof typeof actual] === value,
            )
          );
        }),
      false,
      'SKU, quantity, mode and periods must preserve customer facts; unknown variants stay unknown.',
    );
  if ('discountPercent' in expected)
    add('requested_discount', request.discountPercent === expected.discountPercent, false);
  if (expected.reasons)
    add(
      'required_policy_reasons',
      expected.reasons.every((code) => assessment.reasons.some((reason) => reason.code === code)),
    );
  if (expected.missing !== undefined)
    add('missing_details', assessment.missing.length > 0 === expected.missing, false);
  if (expected.totalMinor !== undefined)
    add('reference_total', assessment.quote?.totalMinor === expected.totalMinor);
  const quote = assessment.quote;
  if (quote) {
    add('currency', quote.currency === context.tenant.currency);
    const subtotal = quote.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n);
    const expectedDiscount =
      (subtotal * scaled(request.discountPercent ?? '0') + 500000n) / 1000000n;
    add('discount_arithmetic', BigInt(quote.discountMinor) === expectedDiscount);
    const discounted = subtotal - BigInt(quote.discountMinor);
    const vat = (discounted * BigInt(context.tenant.vatBasisPoints) + 5000n) / 10000n;
    add(
      'invoice_arithmetic',
      subtotal === BigInt(quote.subtotalMinor) &&
        vat === BigInt(quote.vatMinor) &&
        discounted + vat === BigInt(quote.totalMinor),
    );
    add(
      'source_rates',
      quote.lines.every((line) => {
        const row = context.rows.find((source) => source.id === line.sku);
        return (
          row &&
          [
            row.buyMinor,
            row.rentPerMonthMinor,
            row.perDayMinor,
            row.perShiftMinor,
            row.flatMinor,
          ].some((price) => price === BigInt(line.unitPriceMinor))
        );
      }),
    );
  }
  return checks;
}
