import type {
  GetActivityResponse,
  GetInboxResponse,
  GetQualityAttemptResponse,
  GetQualityOverviewResponse,
  GetSettingsResponse,
  GetWorkspaceResponse,
  ReviewDraftData,
} from '@/api/types.gen';

export type Tenant = GetWorkspaceResponse['tenants'][number];
export type InboxItem = GetInboxResponse['items'][number];
export type Action = ReviewDraftData['body']['action'];
export type QualityOverview = GetQualityOverviewResponse;
export type QualityAttempt = QualityOverview['attempts'][number];
export type QualityAttemptDetail = GetQualityAttemptResponse;
export type ActivityEntry = GetActivityResponse['entries'][number];
export type ActivityCategory = ActivityEntry['category'];
export type Settings = GetSettingsResponse;
