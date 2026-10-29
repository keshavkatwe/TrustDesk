import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { Elysia, t } from 'elysia';

const Health = t.Object({
  status: t.Literal('ok'),
  service: t.Literal('trustdesk-api'),
});

// Keep construction separate from listening so spec export needs no running services.
export function createApp() {
  return new Elysia({ name: 'trustdesk-api' })
    .use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))
    .use(
      openapi({
        path: '/openapi',
        documentation: {
          info: { title: 'TrustDesk API', version: '0.0.0' },
        },
      }),
    )
    .get('/healthz', () => ({ status: 'ok', service: 'trustdesk-api' }) as const, {
      response: { 200: Health },
      detail: {
        operationId: 'getHealth',
        tags: ['system'],
        summary: 'API liveness',
      },
    });
}
