import { z } from 'zod';
import { PricingRequest } from '../pricing/model.ts';

export const PROMPT_VERSION = 'enquiry-draft-1';
export const DEFAULT_MODEL = 'gpt-5.4-mini-2026-03-17';
export const GenerateInput = z.strictObject({ revision: z.number().int().positive() });
export const GenerateResult = z.object({ id: z.string(), runId: z.string() });
export const DraftOutput = z.strictObject({
  title: z.string().min(1).max(120),
  request: PricingRequest,
});
export type DraftOutput = z.infer<typeof DraftOutput>;
export const Usage = z.object({
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.string().nullable(),
});
export const Generation = z.object({
  id: z.string(),
  status: z.enum(['running', 'succeeded', 'failed', 'superseded']),
  model: z.string(),
  promptVersion: z.string(),
  errorCode: z.string().nullable(),
  responseId: z.string().nullable(),
  usage: Usage.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
});
export type ProviderInput = { system: string; user: string };
export type ProviderResponse = {
  text: string;
  responseId: string;
  model: string;
  usage: z.infer<typeof Usage> | null;
  errorCode: 'refusal' | 'incomplete' | null;
};
export type DraftProvider = {
  model: string;
  generate: (input: ProviderInput) => Promise<ProviderResponse>;
};
