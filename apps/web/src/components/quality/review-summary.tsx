import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { QualityOverview } from '@/types/api';

export function ReviewSummary({ reviews }: { reviews: QualityOverview['summary']['reviews'] }) {
  const entries = [
    ['Approved', reviews.approved],
    ['Rejected', reviews.rejected],
    ['Handed off', reviews.handedOff],
    ['Edited', reviews.edited],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Human decisions</CardTitle>
        <CardDescription>Reviews of drafts from the recent attempts shown here.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {entries.map(([label, count]) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">
          Workflow approvals are not evaluation labels or judge calibration.
        </p>
      </CardFooter>
    </Card>
  );
}
