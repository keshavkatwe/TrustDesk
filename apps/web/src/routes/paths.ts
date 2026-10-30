import { generatePath } from 'react-router';

export const routePatterns = {
  business: '/businesses/:tenantId',
  inbox: '/businesses/:tenantId/inbox',
} as const;

export const paths = {
  home: '/',
  inbox: (tenantId: string) => generatePath(routePatterns.inbox, { tenantId }),
};
