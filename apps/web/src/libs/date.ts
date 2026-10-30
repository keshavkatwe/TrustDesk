import { tz } from '@date-fns/tz';
import { format, parseISO } from 'date-fns';

// API timestamps include an offset. Always display the business's timezone,
// regardless of the timezone on the reviewer's computer.
export function formatTimestamp(value: string, timezone: string) {
  return format(parseISO(value), 'dd MMM, HH:mm', { in: tz(timezone) });
}
