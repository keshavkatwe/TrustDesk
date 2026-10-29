import type { ComponentProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { type InboxItem, statuses } from './types';

const variants: Record<InboxItem['status'], ComponentProps<typeof Badge>['variant']> = {
  needs_approval: 'warning',
  approved: 'success',
  rejected: 'destructive',
  handed_off: 'info',
  superseded: 'secondary',
};

export function StatusBadge({ status }: { status: InboxItem['status'] }) {
  return <Badge variant={variants[status]}>{statuses[status]}</Badge>;
}
