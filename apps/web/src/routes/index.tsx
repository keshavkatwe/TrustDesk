import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/not-found-page';
import { WorkspacePage } from '@/pages/workspace-page';
import { WorkspaceLayout } from '@/widgets/app-shell/workspace-layout';
import { paths, routePatterns } from './paths';

const InboxPage = lazy(() => import('@/pages/inbox-page'));
const QualityPage = lazy(() => import('@/pages/quality-page'));

export function AppRoutes() {
  return (
    <Routes>
      <Route path={paths.home} element={<WorkspacePage />} />
      <Route path={routePatterns.business} element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="inbox" replace />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="quality" element={<QualityPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
