import type {
  GetDemoInboxResponse,
  GetDemoWorkspaceResponse,
  ReviewDemoDraftData,
} from '@/api/types.gen';

export type Tenant = GetDemoWorkspaceResponse['tenants'][number];
export type InboxItem = GetDemoInboxResponse['items'][number];
export type Action = ReviewDemoDraftData['body']['action'];
