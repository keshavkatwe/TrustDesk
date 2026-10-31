import type { Failure } from '../result.ts';

export type DraftingFailure = Failure<
  'not_found' | 'invalid_request' | 'conflict' | 'unconfigured' | 'generation_failed'
>;
export type DraftingResult = { ok: true; id: string; runId: string } | DraftingFailure;
