import type {
  GetInboxResponse,
  GetQualityAttemptResponse,
  GetQualityOverviewResponse,
  GetWorkspaceResponse,
  ReviewDraftData,
} from '@/api/types.gen';

export type Tenant = GetWorkspaceResponse['tenants'][number];
export type InboxItem = GetInboxResponse['items'][number];
export type Action = ReviewDraftData['body']['action'];
export type QualityOverview = GetQualityOverviewResponse;
export type QualityAttempt = QualityOverview['attempts'][number];
export type QualityAttemptDetail = GetQualityAttemptResponse;
