import { useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { getActivityOptions } from '@/api/@tanstack/react-query.gen';
import { ActivityFeed } from '@/components/activity/activity-feed';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WorkspaceHeader } from '@/components/workspace-header';
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import type { ActivityCategory, Tenant } from '@/types/api';

export const activityCategories = {
  receipt: 'Message receipts',
  draft: 'Draft versions',
  ai: 'AI attempts',
  review: 'Human reviews',
  delivery: 'Simulated delivery',
  settings: 'Settings changes',
} as const;
export function ActivityWorkspace({ tenant }: { tenant: Tenant }) {
  const [category, setCategory] = useState<ActivityCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const query = useQuery({
    ...getActivityOptions({
      path: { tenantId: tenant.id },
      query: category === 'all' ? {} : { category },
    }),
    retry: false,
    refetchInterval: 5000,
  });
  return (
    <>
      <WorkspaceHeader
        title="Activity"
        description={`${tenant.shortName} · Saved workflow history`}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Refresh
        </Button>
      </WorkspaceHeader>
      <div id="activity" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <Field>
              <FieldLabel htmlFor="activity-search" className="sr-only">
                Search activity
              </FieldLabel>
              <Input
                id="activity-search"
                placeholder="Search recent activity…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="activity-category" className="sr-only">
                Activity category
              </FieldLabel>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as ActivityCategory | 'all')}
              >
                <SelectTrigger id="activity-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All activity</SelectItem>
                    {Object.entries(activityCategories).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {query.isPending ? (
            <LoadingWorkspace />
          ) : query.isError ? (
            <LoadError onRetry={() => void query.refetch()} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Latest {query.data.limit} saved entries
                {category === 'all' ? '' : ` · ${activityCategories[category]}`}. Times use{' '}
                {tenant.timezone}. Search applies to this recent window.
                {query.data.hasMore ? ' Older records remain in the database.' : ''}
              </p>
              <ActivityFeed
                entries={query.data.entries}
                search={search}
                timezone={tenant.timezone}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
