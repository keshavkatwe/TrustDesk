import { EyeIcon, FlaskConicalIcon } from 'lucide-react';
import { AttemptStatus, attemptStatuses } from '@/components/quality/attempt-status';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatTimestamp } from '@/libs/date';
import { formatAiCost, formatDuration } from '@/libs/quality';
import type { QualityAttempt } from '@/types/api';

export function AttemptsTable({
  attempts,
  filter,
  onFilterChange,
  onInspect,
  timezone,
}: {
  attempts: QualityAttempt[];
  filter: string;
  onFilterChange: (value: string) => void;
  onInspect: (id: string) => void;
  timezone: string;
}) {
  const matching = attempts.filter((attempt) => filter === 'all' || attempt.status === filter);
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>AI attempts</CardTitle>
          <CardDescription>Saved attempts across model and prompt versions.</CardDescription>
        </div>
        <CardAction className="w-full sm:w-40">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="attempt-status" className="sr-only">
                Attempt status
              </FieldLabel>
              <Select value={filter} onValueChange={onFilterChange}>
                <SelectTrigger id="attempt-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All outcomes</SelectItem>
                    {Object.entries(attemptStatuses).map(([value, status]) => (
                      <SelectItem key={value} value={value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="min-w-0">
        {matching.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FlaskConicalIcon />
              </EmptyMedia>
              <EmptyTitle>
                {attempts.length === 0 ? 'No AI attempts yet' : 'No matching attempts'}
              </EmptyTitle>
              <EmptyDescription>
                {attempts.length === 0
                  ? 'Submit a test enquiry from the inbox. Its saved AI attempt will appear here.'
                  : 'Choose another outcome to see the saved attempts.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enquiry</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Started / duration</TableHead>
                <TableHead>Est. USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matching.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell>
                    <div className="flex max-w-48 flex-col gap-1">
                      <Button
                        variant="link"
                        size="sm"
                        className="max-w-48 justify-start"
                        onClick={() => onInspect(attempt.id)}
                        aria-label={`Inspect ${attempt.title}`}
                        title={attempt.title}
                      >
                        <span className="truncate">{attempt.title}</span>
                        <EyeIcon data-icon="inline-end" />
                      </Button>
                      <span className="truncate text-xs text-muted-foreground">
                        {attempt.model}
                      </span>
                      <span className="text-xs text-muted-foreground">{attempt.promptVersion}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <AttemptStatus status={attempt.status} />
                    {attempt.errorCode && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {attempt.errorCode.replaceAll('_', ' ')}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>{formatTimestamp(attempt.createdAt, timezone)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(attempt.durationMs)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatAiCost(attempt.usage?.estimatedCostUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
