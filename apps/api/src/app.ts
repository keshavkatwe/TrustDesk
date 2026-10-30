import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { createDemoModule } from './modules/demo/index.ts';
import { health } from './modules/health/index.ts';

// Keep construction separate from listening so spec export needs no running services.
export function createApp() {
  return new Elysia({ name: 'trustdesk-api' })
    .use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))
    .use(
      openapi({
        path: '/openapi',
        mapJsonSchema: { zod: z.toJSONSchema },
        documentation: {
          info: { title: 'TrustDesk API', version: '0.0.0' },
        },
      }),
    )
    .use(createDemoModule())
    .use(health);
}
