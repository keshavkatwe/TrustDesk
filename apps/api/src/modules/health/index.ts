import { Elysia } from 'elysia';
import { Health } from './model.ts';

export const health = new Elysia({ name: 'health' }).get(
  '/healthz',
  () => ({ status: 'ok', service: 'trustdesk-api' }) as const,
  {
    response: { 200: Health },
    detail: {
      operationId: 'getHealth',
      tags: ['system'],
      summary: 'API liveness',
    },
  },
);
