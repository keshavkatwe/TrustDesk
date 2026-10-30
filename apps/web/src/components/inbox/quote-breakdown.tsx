import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money } from '@/libs/money';
import type { InboxItem } from '@/types/api';

export function QuoteBreakdown({ quote }: { quote: NonNullable<InboxItem['quote']> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Quote breakdown</h3>
        </CardTitle>
        <CardDescription>
          Sample catalogue amounts · {quote.currency} · {quote.vatPercent}% VAT
        </CardDescription>
        <CardAction>
          <Badge variant={quote.complete ? 'success' : 'warning'}>
            {quote.complete ? 'Complete' : 'Partial estimate'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableCaption>
            Seed catalogue v1.2. Amounts below are hand-authored fixtures.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Catalogue row</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Qty × periods</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quote.lines.map((line) => (
              <TableRow key={line.sku}>
                <TableCell>
                  <span className="block">{line.label}</span>
                  <span className="text-xs text-muted-foreground">
                    <bdi>{line.sku}</bdi>
                  </span>
                </TableCell>
                <TableCell>
                  <bdi>{money(line.unitPriceMinor, quote.currency)}</bdi>
                  <span className="block text-xs text-muted-foreground">{line.unit}</span>
                </TableCell>
                <TableCell>
                  <bdi>
                    {line.quantity} × {line.periods}
                  </bdi>
                </TableCell>
                <TableCell className="text-right">
                  <bdi>{money(line.lineTotalMinor, quote.currency)}</bdi>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-2 text-sm">
          {[
            ['Subtotal', quote.subtotalMinor],
            ['Discount', -quote.discountMinor],
            [`VAT (${quote.vatPercent}%)`, quote.vatMinor],
            ['Total including VAT', quote.totalMinor],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt>{label}</dt>
              <dd>
                <bdi>{money(Number(value), quote.currency)}</bdi>
              </dd>
            </div>
          ))}
        </dl>
        <Alert>
          <AlertTitle>Check exclusions before quoting</AlertTitle>
          <AlertDescription>{quote.note}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
