import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import type {
  ActivityService,
  DraftingService,
  InboxService,
  QualityService,
  ReceiveService,
  SettingsService,
} from '@trustdesk/core';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { createActivityModule } from './modules/activity/index.ts';
import { createDraftingModule } from './modules/drafting/index.ts';
import { health } from './modules/health/index.ts';
import { createInboxModule } from './modules/inbox/index.ts';
import { createQualityModule } from './modules/quality/index.ts';
import { createReceiveModule } from './modules/receive/index.ts';
import { createSettingsModule } from './modules/settings/index.ts';

// Keep construction separate from listening so spec export needs no running services.
export function createApp(
  services: {
    inbox?: InboxService;
    drafting?: DraftingService;
    receive?: ReceiveService;
    quality?: QualityService;
    activity?: ActivityService;
    settings?: SettingsService;
  } = {},
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
    .use(createInboxModule(services.inbox))
    .use(createDraftingModule(services.drafting))
    .use(createReceiveModule(services.receive))
    .use(createQualityModule(services.quality))
    .use(createActivityModule(services.activity))
    .use(createSettingsModule(services.settings))
    .use(health);
}
