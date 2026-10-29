import { useQuery } from '@tanstack/react-query';
import { getHealthOptions } from './api/@tanstack/react-query.gen.ts';
import { Badge } from './components/ui/badge.tsx';
import { Button } from './components/ui/button.tsx';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card.tsx';

export function App() {
  const health = useQuery({ ...getHealthOptions(), retry: false });

  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            <h1>TrustDesk</h1>
          </CardTitle>
          <CardDescription>The workspace is ready for the first feature.</CardDescription>
          <CardAction>
            <Badge variant="secondary">Boilerplate</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {health.isPending
              ? 'Connecting to the API…'
              : health.isError
                ? 'API unavailable. Start the API and try again.'
                : 'API connected.'}
          </p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={() => void health.refetch()} disabled={health.isFetching}>
            {health.isFetching ? 'Checking…' : 'Check API'}
          </Button>
          <Button variant="outline" asChild>
            <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/openapi`}>
              API docs
            </a>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
