import { z } from 'zod';

export { InboxError, InboxParams } from '@trustdesk/core/inbox/model';
export { Settings, UpdateSettings } from '@trustdesk/core/settings/model';
export const SettingsSaved = z.object({ changed: z.boolean() });
