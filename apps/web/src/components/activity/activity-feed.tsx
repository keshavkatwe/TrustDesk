import { ActivityIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { formatTimestamp } from '@/libs/date';
import type { ActivityEntry } from '@/types/api';

function outcomeLabel(value: string) {
  return (
    (
      {
        simulated_sent: 'Sent · simulated',
        approve: 'Approved',
        reject: 'Rejected',
        hand_off: 'Handed off',
        succeeded: 'Prepared',
        received: 'Placeholder',
        openai: 'AI prepared',
        sample: 'Sample',
        saved: 'Saved',
      } as Record<string, string>
    )[value] ?? value.replaceAll('_', ' ')
  );
}
function outcomeVariant(value: string) {
  if (['failed', 'conflict', 'reject', 'cancelled'].includes(value)) return 'destructive';
  if (['succeeded', 'simulated_sent', 'approve', 'saved'].includes(value)) return 'success';
  if (['running', 'pending', 'duplicate'].includes(value)) return 'warning';
  return 'secondary';
}
export function ActivityFeed({
  entries,
  search,
  timezone,
}: {
  entries: ActivityEntry[];
  search: string;
  timezone: string;
}) {
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const term = search.trim().toLocaleLowerCase();
  const matching = entries.filter((entry) =>
    [entry.title, entry.description, entry.actor, entry.reference, entry.outcome]
      .join(' ')
      .toLocaleLowerCase()
      .includes(term),
  );
  return (
    <>
      {matching.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyTitle>{entries.length ? 'No matching activity' : 'No activity yet'}</EmptyTitle>
            <EmptyDescription>
              {entries.length
                ? 'Try another search or category.'
                : 'Saved receipts, drafts, reviews and rule changes will appear here.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent history</CardTitle>
            <CardDescription>
              {matching.length} entries · Select an entry for its saved details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col divide-y">
              {matching.map((entry) => (
                <li key={entry.id}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal px-2 py-4 text-left"
                    onClick={() => setSelected(entry)}
                    aria-label={`Inspect ${entry.title}`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{entry.title}</span>
                        <Badge variant={outcomeVariant(entry.outcome)}>
                          {outcomeLabel(entry.outcome)}
                        </Badge>
                      </div>
                      <p
                        className="line-clamp-2 break-words text-sm text-muted-foreground"
                        dir="auto"
                      >
                        {entry.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.actor} · {formatTimestamp(entry.at, timezone)}
                      </p>
                    </div>
                  </Button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? 'Activity details'}</DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.actor} · ${formatTimestamp(selected.at, timezone)}`
                : 'Saved workflow evidence'}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <Badge variant={outcomeVariant(selected.outcome)}>
                {outcomeLabel(selected.outcome)}
              </Badge>
              <p className="whitespace-pre-wrap break-words text-sm" dir="auto">
                {selected.description}
              </p>
              <dl className="flex min-w-0 flex-col gap-4">
                {selected.details.map((detail) => (
                  <div key={detail.label}>
                    <dt className="text-xs text-muted-foreground">{detail.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm" dir="auto">
                      {detail.format === 'timestamp'
                        ? formatTimestamp(detail.value, timezone)
                        : detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
