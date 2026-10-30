import { ArrowLeftIcon, RefreshCwIcon } from 'lucide-react';
import { EmptyInbox } from '@/components/inbox/empty-inbox';
import { MessageRow } from '@/components/inbox/message-row';
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
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import { useInbox } from '@/hooks/use-inbox';
import { statuses } from '@/libs/inbox';
import { cn } from '@/libs/utils';
import type { Tenant } from '@/types/api';
import { ReviewPanel } from './review-panel';

export function InboxWorkspace({ tenant }: { tenant: Tenant }) {
  const {
    inbox,
    selected,
    matching,
    pending,
    search,
    setSearch,
    filter,
    setFilter,
    approverId,
    setApproverId,
    setSelectedId,
    clearFilters,
  } = useInbox(tenant.id);
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
