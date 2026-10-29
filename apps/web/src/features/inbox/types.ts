import type {
  GetDemoInboxResponse,
  GetDemoWorkspaceResponse,
  ReviewDemoDraftData,
} from '@/api/types.gen';

export type Tenant = GetDemoWorkspaceResponse['tenants'][number];
export type InboxItem = GetDemoInboxResponse['items'][number];
export type Action = ReviewDemoDraftData['body']['action'];
export const statuses: Record<InboxItem['status'], string> = {
  needs_approval: 'Needs approval',
  approved: 'Approved · not sent',
  rejected: 'Rejected',
  handed_off: 'Handed off',
  superseded: 'Superseded',
};
export function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(minor === 0 ? 0 : minor / 100);
}
export function timestamp(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}
