export function formatAiCost(value: string | null | undefined) {
  if (!value || !/^\d+(?:\.\d{1,9})?$/.test(value)) return 'Unknown';
  const [whole, fraction = ''] = value.split('.');
  const digits = fraction.replace(/0+$/, '');
  return `$${whole}.${digits || '00'}`;
}

export function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return 'Not recorded';
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}
