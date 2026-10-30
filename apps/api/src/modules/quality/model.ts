import { z } from 'zod';

export { InboxError, InboxParams } from '@trustdesk/core/inbox/model';
export { QualityAttemptDetail, QualityOverview } from '@trustdesk/core/quality/model';

import { InboxParams } from '@trustdesk/core/inbox/model';
export const QualityAttemptParams = InboxParams.extend({ runId: z.string().min(1).max(200) });
