import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { getDemoInboxOptions } from '@/api/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ReviewPanel } from './review-panel';
import { EmptyInbox, LoadError, LoadingWorkspace } from './states';
import { StatusBadge } from './status-badge';
import { type InboxItem, statuses, type Tenant, timestamp } from './types';

export function InboxWorkspace({ tenant }: { tenant: Tenant }) {
  const inbox = useQuery({
    ...getDemoInboxOptions({ path: { tenantId: tenant.id } }),
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('needs_approval');
  const [search, setSearch] = useState('');
  const [approverId, setApproverId] = useState('');
  const isMobile = useIsMobile();
  const items = inbox.data?.items ?? [];
  const matching = items.filter(
    (item) =>
      (filter === 'all' || item.status === filter) &&
      [item.title, item.body, item.customer, item.sourceEvent]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase().trim()),
  );
  const selected = selectedId
    ? items.find((item) => item.id === selectedId)
    : !isMobile
      ? matching[0]
      : undefined;
  const pending = items.filter((item) => item.status === 'needs_approval').length;
  const clearFilters = () => {
    setFilter('all');
    setSearch('');
    setSelectedId(null);
  };
  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div>
            <h1 className="font-semibold">Inbox</h1>
            <p className="text-xs text-muted-foreground">
              {tenant.shortName} · {pending} awaiting review
            </p>
          </div>
        </div>
        <FieldGroup className="w-full sm:w-72">
          <Field orientation="horizontal">
            <FieldLabel htmlFor="approver">Review as</FieldLabel>
            <Select value={approverId} onValueChange={setApproverId}>
              <SelectTrigger id="approver" className="w-44">
                <SelectValue placeholder="Choose approver" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tenant.approvers.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} · {person.role}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </header>
      {inbox.isError ? (
        <div className="p-6">
          <LoadError onRetry={() => void inbox.refetch()} />
        </div>
      ) : inbox.isPending ? (
        <div className="p-6">
          <LoadingWorkspace />
        </div>
      ) : (
        <div
          id="inbox"
          tabIndex={-1}
          className="grid min-h-0 flex-1 md:grid-cols-[20rem_minmax(0,1fr)]"
        >
          <section
            aria-label="Message list"
            className={cn('flex min-h-0 flex-col border-r', selected && 'hidden md:flex')}
          >
            <div className="px-3 py-2">
              <FieldGroup className="gap-2">
                <Field>
                  <FieldLabel htmlFor="search" className="sr-only">
                    Search messages
                  </FieldLabel>
                  <Input
                    id="search"
                    placeholder="Search messages…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setSelectedId(null);
                    }}
                  />
                </Field>
                <div className="flex items-center gap-2">
                  <Field className="min-w-0 flex-1">
                    <FieldLabel htmlFor="status" className="sr-only">
                      Message status
                    </FieldLabel>
                    <Select
                      value={filter}
                      onValueChange={(value) => {
                        setFilter(value);
                        setSelectedId(null);
                      }}
                    >
                      <SelectTrigger id="status" size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">All messages</SelectItem>
                          {Object.entries(statuses).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
                    {matching.length} message{matching.length === 1 ? '' : 's'}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh inbox"
                    disabled={inbox.isFetching}
                    onClick={() => void inbox.refetch()}
                  >
                    <RefreshCwIcon />
                  </Button>
                </div>
              </FieldGroup>
            </div>
            <Separator />
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {matching.length === 0 ? (
                <EmptyInbox onClear={clearFilters} />
              ) : (
                <ul className="flex flex-col gap-1">
                  {matching.map((item) => (
                    <li key={item.id}>
                      <MessageRow
                        item={item}
                        selected={selected?.id === item.id}
                        timezone={tenant.timezone}
                        onSelect={() => setSelectedId(item.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section
            key={`${selected?.id ?? 'empty'}:${selected?.revision ?? 0}`}
            aria-label="Message review"
            className={cn('min-h-0 min-w-0 overflow-y-auto', !selected && 'hidden md:block')}
          >
            {selected ? (
              <>
                <div className="px-4 pt-2 md:hidden">
                  <Button variant="ghost" onClick={() => setSelectedId(null)}>
                    <ArrowLeftIcon data-icon="inline-start" />
                    Back to messages
                  </Button>
                </div>
                <ReviewPanel
                  key={`${tenant.id}:${selected.id}:${selected.revision}`}
                  item={selected}
                  tenant={tenant}
                  approverId={approverId}
                  outsideFilter={!matching.some((item) => item.id === selected.id)}
                  onBack={() => setSelectedId(null)}
                  onSelect={setSelectedId}
                  onReviewed={() => setSelectedId(selected.id)}
                />
              </>
            ) : (
              <EmptyInbox />
            )}
          </section>
        </div>
      )}
    </>
  );
}
function MessageRow({
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
        <time dateTime={item.receivedAt}>{timestamp(item.receivedAt, timezone)}</time>
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
        <StatusBadge status={item.status} />
      </span>
    </Button>
  );
}
