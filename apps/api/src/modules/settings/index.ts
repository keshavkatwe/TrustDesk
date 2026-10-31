import type { SettingsService } from '@trustdesk/core';
import { createController } from '../../controller.ts';
import { InboxError, InboxParams, Settings, SettingsSaved, UpdateSettings } from './model.ts';

const errorStatus = { not_found: 404, conflict: 409, invalid: 422 } as const;

export function createSettingsModule(service?: SettingsService) {
  const unavailable = {
    message: 'Settings are unavailable. Check the API and database, then try again.',
  };
  return createController('settings', {
    invalid: 'Invalid settings. Check percentages, amounts and rental limits.',
    unavailable: unavailable.message,
  })
    .get(
      '/tenants/:tenantId/settings',
      async ({ params, status }) => {
        if (!service) return status(503, unavailable);
        return (
          (await service.get(params.tenantId)) ?? status(404, { message: 'Business not found.' })
        );
      },
      {
        params: InboxParams,
        response: { 200: Settings, 404: InboxError, 422: InboxError, 503: InboxError },
        detail: {
          operationId: 'getSettings',
          tags: ['settings'],
          summary: 'Business rules, receiving channels, approvers and safe AI configuration',
        },
      },
    )
    .put(
      '/tenants/:tenantId/settings',
      async ({ params, body, status }) => {
        if (!service) return status(503, unavailable);
        const result = await service.update(params.tenantId, body);
        if (result.ok) return { changed: result.changed };
        return status(errorStatus[result.code], {
          message: result.message,
        });
      },
      {
        params: InboxParams,
        body: UpdateSettings,
        response: {
          200: SettingsSaved,
          404: InboxError,
          409: InboxError,
          422: InboxError,
          503: InboxError,
        },
        detail: {
          operationId: 'updateSettings',
          tags: ['settings'],
          summary: 'Save business rules and named before/after audit record atomically',
        },
      },
    );
}
