import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import { getDemoWorkspaceOptions } from '@/api/@tanstack/react-query.gen';
import type { Tenant } from '@/types/api';

export function useWorkspace() {
  return useQuery({ ...getDemoWorkspaceOptions(), retry: false });
}

// Only route pages rendered inside WorkspaceLayout have a resolved business.
export function useCurrentTenant() {
  return useOutletContext<Tenant>();
}
