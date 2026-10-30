import { InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

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
