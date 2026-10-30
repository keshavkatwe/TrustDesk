import type { ReceiveService } from '@trustdesk/core';
import { Elysia } from 'elysia';
import { InboxError, ReceiptResult, SourceEvent } from './model.ts';
export function createReceiveModule(service?: ReceiveService) {
  return new Elysia({ name: 'receive' })
    .onError(({ code, status }) =>
      status(code === 'VALIDATION' ? 422 : 503, {
        message:
          code === 'VALIDATION'
            ? 'Invalid incoming event.'
            : 'The incoming event could not be saved and queued. Try again.',
      }),
    )
    .post(
      '/local/events',
      async ({ body, status }) => {
        if (!service) return status(503, { message: 'The local incoming adapter is unavailable.' });
        const result = await service.receive(body);
        if (!result.ok)
          return status(result.code === 'message_conflict' ? 409 : 422, {
            message: result.message,
          });
        const { ok: _, ...receipt } = result;
        return status(202, receipt);
      },
      {
        body: SourceEvent,
        response: { 202: ReceiptResult, 409: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'receiveEvent',
          tags: ['receive'],
          summary:
            'Local synthetic adapter: resolve receiving business, save receipt/message and atomically queue drafting',
        },
      },
    );
}
