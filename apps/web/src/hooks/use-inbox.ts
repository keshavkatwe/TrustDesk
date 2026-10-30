import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getDemoInboxOptions } from '@/api/@tanstack/react-query.gen';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Tenant } from '@/types/api';

export function useInbox(tenantId: Tenant['id']) {
  const inbox = useQuery({ ...getDemoInboxOptions({ path: { tenantId } }), retry: false });
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

  function clearFilters() {
    setFilter('all');
    setSearch('');
    setSelectedId(null);
  }

  return {
    inbox,
    selected,
    matching,
    pending,
    filter,
    setFilter,
    search,
    setSearch,
    approverId,
    setApproverId,
    setSelectedId,
    clearFilters,
  };
}
