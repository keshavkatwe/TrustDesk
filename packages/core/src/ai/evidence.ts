import type { messages } from '@trustdesk/db';
import { DraftEvidence } from '../inbox/model.ts';
import { formatMinor } from '../pricing/decimal.ts';
import type { Assessment } from '../pricing/model.ts';
import type { DraftOutput } from './model.ts';

export function buildDraftEvidence(
  output: DraftOutput,
  assessment: Assessment,
  history: Pick<typeof messages.$inferSelect, 'id' | 'sourceEvent' | 'body'>[],
  messageId: string,
  currency: string,
) {
  return DraftEvidence.parse({
    title: output.title,
    language: output.request.language,
    assessment,
    context: history
      .filter((message) => message.id !== messageId)
      .map((message) => ({
        label: `Earlier message · ${message.sourceEvent}`,
        body: message.body,
      })),
    extracted: [
      ...output.request.lines.map((line, index) => ({
        label: `Item ${index + 1} · ${line.sku ?? 'Unmatched product'}`,
        value: `${line.description} · ${line.quantity ?? '?'} ${line.unit} · ${line.periods ?? '?'} ${line.mode}`,
      })),
      { label: 'Location', value: output.request.location ?? 'Unspecified' },
      {
        label: 'Requested date · unconfirmed',
        value: output.request.requestedDate ?? 'Unspecified',
      },
      ...(output.request.notes ? [{ label: 'Customer context', value: output.request.notes }] : []),
      {
        label: 'Delivery',
        value: `${output.request.delivery}${output.request.deliveryTrips === null ? '' : ` · ${output.request.deliveryTrips} trips`}`,
      },
      {
        label: 'Discount requested',
        value: output.request.discountRequested
          ? output.request.discountPercent === null
            ? 'Yes · no percentage specified'
            : `${output.request.discountPercent}%`
          : 'No',
      },
      {
        label: 'Budget',
        value:
          output.request.budgetMinor === null
            ? 'Unspecified'
            : `${currency} ${formatMinor(output.request.budgetMinor)}`,
      },
      {
        label: 'Availability requested',
        value: output.request.availabilityRequested ? 'Yes · team must confirm' : 'No',
      },
    ],
    missing: assessment.missing,
    reasons: assessment.reasons,
    quote: assessment.quote,
    recommendedAction:
      assessment.disposition === 'hand_off' || assessment.disposition === 'drop'
        ? 'hand_off'
        : 'approve',
    supersededBy: null,
  });
}
