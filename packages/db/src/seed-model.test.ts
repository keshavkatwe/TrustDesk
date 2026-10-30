import { expect, test } from 'bun:test';
import { scaledInteger } from './seed-model.ts';

test('source decimals become exact minor units and basis points', () => {
  expect(scaledInteger(3399, 2)).toBe(339900n);
  expect(scaledInteger(0.29, 2)).toBe(29n);
  expect(scaledInteger(0.05, 4)).toBe(500n);
  expect(scaledInteger(0, 2)).toBe(0n);
});

test('source prices with excess precision are rejected instead of rounded', () => {
  expect(() => scaledInteger(1.005, 2)).toThrow();
  expect(() => scaledInteger(-1, 2)).toThrow();
});
