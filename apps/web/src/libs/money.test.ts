import { expect, test } from 'bun:test';
import { money } from './money';

test('money display preserves the last minor unit across the full safe integer range', () => {
  expect(money(Number.MAX_SAFE_INTEGER, 'AED').replace(/\s/g, ' ')).toBe(
    'AED 90,071,992,547,409.91',
  );
  expect(money(1784475, 'AED').replace(/\s/g, ' ')).toBe('AED 17,844.75');
  expect(money(-1, 'SAR').replace(/\s/g, ' ')).toBe('-SAR 0.01');
  expect(() => money(0.1, 'AED')).toThrow();
});
