import { RouteNotFound } from '@/components/route-not-found';

export function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <RouteNotFound />
    </main>
  );
}
