import { z } from 'zod';

export const SCALE = 10_000n;
export function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)))
    .replace('٫', '.');
}
export const Decimal = z
  .string()
  .max(20)
  .regex(/^[0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]{1,4})?$/);
export function scaled(value: string) {
  const [whole = '0', fraction = ''] = normalizeDigits(Decimal.parse(value)).split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, '0'));
}
export const Quantity = Decimal.refine(
  (value) => scaled(value) > 0n && scaled(value) <= 1_000_000n * SCALE,
  'Quantity must be positive and at most 1,000,000.',
);
export const Percent = Decimal.refine(
  (value) => scaled(value) <= 100n * SCALE,
  'Percentage must be between 0 and 100.',
);
export function roundHalfUp(numerator: bigint, denominator: bigint) {
  if (numerator < 0n || denominator <= 0n) throw new Error('Invalid monetary operands.');
  return (numerator * 2n + denominator) / (denominator * 2n);
}
export function safeMinor(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Amount exceeds the supported range.');
  return Number(value);
}

export function formatMinor(value: bigint | number) {
  const amount = BigInt(value);
  if (amount < 0n) throw new Error('Expected nonnegative money.');
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
