import { describe, expect, test } from 'bun:test';
import { formatTimestamp } from './date';

describe('business timestamps', () => {
  test('the same instant can fall on different days in Dubai and Riyadh', () => {
    const instant = '2026-11-01T20:30:00Z';
    expect(formatTimestamp(instant, 'Asia/Dubai')).toBe('02 Nov, 00:30');
    expect(formatTimestamp(instant, 'Asia/Riyadh')).toBe('01 Nov, 23:30');
  });

  test('preserves the instant in an API timestamp with an explicit offset', () => {
    const instant = '2026-11-02T08:15:00+04:00';
    expect(formatTimestamp(instant, 'Asia/Dubai')).toBe('02 Nov, 08:15');
    expect(formatTimestamp(instant, 'Asia/Riyadh')).toBe('02 Nov, 07:15');
  });

  test('formats the business date across a year boundary', () => {
    expect(formatTimestamp('2026-12-31T21:30:00Z', 'Asia/Dubai')).toBe('01 Jan, 01:30');
  });
});
