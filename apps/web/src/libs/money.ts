export function money(minor: number, currency: string) {
  if (!Number.isSafeInteger(minor)) throw new Error('Money must use safe integer minor units.');
  const amount = BigInt(minor);
  const magnitude = amount < 0n ? -amount : amount;
  const whole = magnitude / 100n;
  const fraction = (magnitude % 100n).toString().padStart(2, '0');
  const formatter = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  });
  // Format the integer as bigint and substitute the exact minor digits, avoiding division through floats.
  const formatted = formatter
    .formatToParts(whole)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
  return amount < 0n ? `-${formatted}` : formatted;
}
