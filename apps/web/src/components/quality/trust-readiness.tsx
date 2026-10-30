import { FlaskConicalIcon, ShieldCheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { QualityOverview } from '@/types/api';

const requirements = [
  {
    title: 'Versioned test cases',
    detail: 'At least 30 cases covering both businesses, languages and risk categories.',
    status: 'Not set up',
  },
  {
    title: 'Baseline and candidate runs',
    detail: 'Saved outputs, code checks and a comparison for each evaluated version.',
    status: 'Not run',
  },
  {
    title: 'Judge calibration',
    detail: 'At least 10 genuinely human-labelled outputs compared with three judge dimensions.',
    status: 'Not calibrated',
  },
  {
    title: 'Named promotion decision',
    detail: 'A person reviews the evidence before this agent version gains autonomy.',
    status: 'Unavailable',
  },
];

export function TrustReadiness({
  configuration,
}: {
  configuration: QualityOverview['configuration'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trust readiness</CardTitle>
        <CardDescription>Evidence required before a version can earn autonomy.</CardDescription>
        <CardAction>
          <Badge variant="warning">
            <ShieldCheckIcon data-icon="inline-start" />
            Supervised
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-5">
          {requirements.map((requirement) => (
            <li key={requirement.title} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{requirement.title}</span>
                <Badge variant="outline">{requirement.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{requirement.detail}</p>
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        <Badge variant="secondary">
          <FlaskConicalIcon data-icon="inline-start" />
          Evaluation not yet measured
        </Badge>
        <p className="text-sm text-muted-foreground">
          {configuration.autoSend === 'off'
            ? 'Automatic sending is off for this business, even if trust is later earned.'
            : 'Low-risk automatic sending needs an evaluated, trusted version. Firm quotes still need named approval.'}
        </p>
      </CardFooter>
    </Card>
  );
}

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
