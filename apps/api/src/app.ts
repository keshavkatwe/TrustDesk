import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import type {
  DraftingService,
  InboxService,
  QualityService,
  ReceiveService,
} from '@trustdesk/core';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { createDraftingModule } from './modules/drafting/index.ts';
import { health } from './modules/health/index.ts';
import { createInboxModule } from './modules/inbox/index.ts';
import { createQualityModule } from './modules/quality/index.ts';
import { createReceiveModule } from './modules/receive/index.ts';

// Keep construction separate from listening so spec export needs no running services.
export function createApp(
  inboxService?: InboxService,
  draftingService?: DraftingService,
  receiveService?: ReceiveService,
  qualityService?: QualityService,
) {
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
    .use(createInboxModule(inboxService))
    .use(createDraftingModule(draftingService))
    .use(createReceiveModule(receiveService))
    .use(createQualityModule(qualityService))
    .use(health);
}
