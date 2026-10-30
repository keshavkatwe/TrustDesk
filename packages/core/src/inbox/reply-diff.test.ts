import { expect, test } from 'bun:test';
import { replyDiff } from './reply-diff.ts';

test('edit record preserves Arabic and emoji using Unicode code point offsets', () => {
  expect(replyDiff('مرحباً 👋', 'مرحباً 🌙')).toEqual({ start: 7, removed: '👋', added: '🌙' });
  for (const [before, after] of [
    ['same', 'same'],
    ['AB', 'A🙂B'],
    ['🙂end', 'end'],
    ['', 'مرحبا'],
  ]) {
    if (before === undefined || after === undefined) throw new Error('Missing input');
    const diff = replyDiff(before, after);
    const points = Array.from(before);
    expect(
      points.slice(0, diff.start).join('') +
        diff.added +
        points.slice(diff.start + Array.from(diff.removed).length).join(''),
    ).toBe(after);
  }
});
