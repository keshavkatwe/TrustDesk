import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { QualityOverview } from '@/types/api';

export function AgentConfiguration({
  configuration,
}: {
  configuration: QualityOverview['configuration'];
}) {
  const entries = [
    ['Model', configuration.model],
    ['Prompt', configuration.promptVersion],
    ['Pricing engine', configuration.engineVersion],
    ['Catalogue', configuration.catalogueVersion ?? 'Unavailable'],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active configuration</CardTitle>
        <CardDescription>Versions used for new drafts.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          {entries.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-all font-mono text-xs">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
