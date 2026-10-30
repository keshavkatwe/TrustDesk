import { generatePath } from 'react-router';

export const routePatterns = {
  business: '/businesses/:tenantId',
  inbox: '/businesses/:tenantId/inbox',
  quality: '/businesses/:tenantId/quality',
} as const;

export const paths = {
  home: '/',
  inbox: (tenantId: string) => generatePath(routePatterns.inbox, { tenantId }),
  quality: (tenantId: string) => generatePath(routePatterns.quality, { tenantId }),
};
