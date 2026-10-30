import { Badge } from '@/components/ui/badge';
import type { QualityAttempt } from '@/types/api';

export const attemptStatuses = {
  running: { label: 'Preparing', variant: 'info' },
  succeeded: { label: 'Prepared', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  superseded: { label: 'Superseded', variant: 'secondary' },
} as const;

export function AttemptStatus({ status }: { status: QualityAttempt['status'] }) {
  const item = attemptStatuses[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}
