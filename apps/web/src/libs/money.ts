export function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(minor === 0 ? 0 : minor / 100);
}
