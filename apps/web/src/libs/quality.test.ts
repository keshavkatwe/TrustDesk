import { expect, test } from 'bun:test';
import { formatAiCost } from './quality';

test('AI cost display preserves tiny estimates and distinguishes unknown from recorded zero', () => {
  expect(formatAiCost('0.000000001')).toBe('$0.000000001');
  expect(formatAiCost('10.120000000')).toBe('$10.12');
  expect(formatAiCost('0.000000000')).toBe('$0.00');
  expect(formatAiCost(null)).toBe('Unknown');
  expect(formatAiCost('invalid')).toBe('Unknown');
});
