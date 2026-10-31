import { generatePath } from 'react-router';

export const routePatterns = {
  business: '/businesses/:tenantId',
  inbox: '/businesses/:tenantId/inbox',
  quality: '/businesses/:tenantId/quality',
  activity: '/businesses/:tenantId/activity',
  settings: '/businesses/:tenantId/settings',
} as const;

export const paths = {
  home: '/',
  inbox: (tenantId: string) => generatePath(routePatterns.inbox, { tenantId }),
  quality: (tenantId: string) => generatePath(routePatterns.quality, { tenantId }),
  activity: (tenantId: string) => generatePath(routePatterns.activity, { tenantId }),
  settings: (tenantId: string) => generatePath(routePatterns.settings, { tenantId }),
};
