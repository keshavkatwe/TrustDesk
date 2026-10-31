import type { SettingsService } from '@trustdesk/core';
import { Elysia } from 'elysia';
import { InboxError, InboxParams, Settings, SettingsSaved, UpdateSettings } from './model.ts';

export function createSettingsModule(service?: SettingsService) {
  const unavailable = {
    message: 'Settings are unavailable. Check the API and database, then try again.',
  };
  return new Elysia({ name: 'settings' })
    .onError(({ code, status }) =>
      status(
        code === 'VALIDATION' ? 422 : 503,
        code === 'VALIDATION'
          ? { message: 'Invalid settings. Check percentages, amounts and rental limits.' }
          : unavailable,
      ),
    )
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
        return status(result.code === 'not_found' ? 404 : result.code === 'conflict' ? 409 : 422, {
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
