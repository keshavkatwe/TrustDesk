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

export function StatusBadge({
  status,
  processingState,
  outboxStatus,
  automatic,
}: {
  status: InboxItem['status'];
  automatic?: boolean;
  processingState?: InboxItem['processingState'];
  outboxStatus?: NonNullable<InboxItem['outbox']>['status'];
}) {
  if (status === 'approved' && outboxStatus === 'simulated_sent')
    return <Badge variant="success">Sent · simulated{automatic ? ' · automatic' : ''}</Badge>;
  if (automatic && status === 'approved' && outboxStatus === 'pending')
    return <Badge variant="info">Queued · automatic FAQ</Badge>;
  if (status === 'approved' && outboxStatus === 'cancelled')
    return <Badge variant="destructive">Send cancelled</Badge>;
  if (
    status === 'needs_approval' &&
    (processingState === 'queued' || processingState === 'processing')
  )
    return (
      <Badge variant="info">
        {processingState === 'queued' ? 'Queued for drafting' : 'Preparing draft'}
      </Badge>
    );
  if (status === 'needs_approval' && processingState === 'failed')
    return <Badge variant="destructive">Draft failed</Badge>;
  return <Badge variant={variants[status]}>{statuses[status]}</Badge>;
}
