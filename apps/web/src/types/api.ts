import type { GetInboxResponse, GetWorkspaceResponse, ReviewDraftData } from '@/api/types.gen';

export type Tenant = GetWorkspaceResponse['tenants'][number];
export type InboxItem = GetInboxResponse['items'][number];
export type Action = ReviewDraftData['body']['action'];
