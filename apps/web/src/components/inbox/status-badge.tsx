import type { ComponentProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { statuses } from '@/libs/inbox';
import type { InboxItem } from '@/types/api';

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
