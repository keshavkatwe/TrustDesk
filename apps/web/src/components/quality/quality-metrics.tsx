import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAiCost } from '@/libs/quality';
import type { QualityOverview } from '@/types/api';

export function QualityMetrics({ summary }: { summary: QualityOverview['summary'] }) {
  const reviewCount =
    summary.reviews.approved + summary.reviews.rejected + summary.reviews.handedOff;
  const metrics = [
    {
      label: 'Drafts prepared',
      value: summary.prepared,
      detail: `${summary.total} AI attempts · ${summary.running} preparing`,
    },
    {
      label: 'Failed attempts',
      value: summary.failed,
      detail: `${summary.superseded} superseded attempts`,
    },
    {
      label: 'Named reviews',
      value: reviewCount,
      detail: `${summary.reviews.edited} replies edited by reviewers`,
    },
    {
      label: 'Estimated AI cost',
      value: formatAiCost(summary.estimatedCostUsd),
      detail:
        summary.total === 0
          ? 'No AI usage recorded'
          : `Known usage only · ${summary.unpriced} unpriced`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} size="sm">
          <CardHeader>
            <CardTitle>{metric.label}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xl font-semibold tabular-nums lg:text-2xl">{metric.value}</p>
            <CardDescription>{metric.detail}</CardDescription>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
