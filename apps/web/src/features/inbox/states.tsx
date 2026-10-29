import { InboxIcon, RefreshCwIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn’t load the sample workspace</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>Check that the API is running, then try again.</p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCwIcon data-icon="inline-start" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
export function LoadingWorkspace() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading sample workspace">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-40 w-full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
export function EmptyInbox({ onClear }: { onClear?: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>{onClear ? 'No matching messages' : 'Select a message'}</EmptyTitle>
        <EmptyDescription>
          {onClear
            ? 'Try another search or status to see more sample messages.'
            : 'Choose a message from the inbox to review its draft and evidence.'}
        </EmptyDescription>
      </EmptyHeader>
      {onClear && (
        <EmptyContent>
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
