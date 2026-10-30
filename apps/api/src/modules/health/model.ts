import { z } from 'zod';

export const Health = z.object({
  status: z.literal('ok'),
  service: z.literal('trustdesk-api'),
});
export type Health = z.infer<typeof Health>;
