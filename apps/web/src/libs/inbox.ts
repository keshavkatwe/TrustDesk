import type { InboxItem } from '@/types/api';

export const statuses: Record<InboxItem['status'], string> = {
  needs_approval: 'Needs approval',
  approved: 'Approved',
  rejected: 'Rejected',
  handed_off: 'Handed off',
  superseded: 'Superseded',
};
