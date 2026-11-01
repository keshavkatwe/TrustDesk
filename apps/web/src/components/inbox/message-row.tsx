import { StatusBadge } from '@/components/inbox/status-badge';
import { Button } from '@/components/ui/button';
import { formatTimestamp } from '@/libs/date';
import type { InboxItem } from '@/types/api';

export function MessageRow({
  item,
  selected,
  timezone,
  onSelect,
}: {
  item: InboxItem;
  selected: boolean;
  timezone: string;
  onSelect: () => void;
}) {
  return (
    <Button
      variant={selected ? 'secondary' : 'ghost'}
      className="h-auto w-full flex-col items-stretch gap-2 p-3"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {item.channel} · {item.language}
        </span>
        <time dateTime={item.receivedAt}>{formatTimestamp(item.receivedAt, timezone)}</time>
      </span>
      <span className="truncate text-start">{item.title}</span>
      <span className="truncate text-start text-xs text-muted-foreground" dir="auto">
        {item.customer}
      </span>
      <span
        className="line-clamp-2 whitespace-normal text-start text-xs text-muted-foreground"
        dir="auto"
      >
        {item.body}
      </span>
      <span className="flex flex-wrap gap-1">
        <StatusBadge
          status={item.status}
          processingState={item.processingState}
          outboxStatus={item.outbox?.status}
          automatic={item.automatic}
        />
      </span>
    </Button>
  );
}
