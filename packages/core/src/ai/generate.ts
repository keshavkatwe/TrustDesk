import OpenAI from 'openai';
import type { PricingContext } from '../pricing/evaluate.ts';
import {
  DraftOutput,
  type DraftProvider,
  type ProviderInput,
  type ProviderResponse,
} from './model.ts';

// One bounded provider call, with no database transaction held and no automatic retries.
export async function generateDraft(
  provider: DraftProvider,
  input: ProviderInput,
  pricing: PricingContext,
) {
  const startedAt = Date.now();
  let response: ProviderResponse | null = null;
  let output: DraftOutput | null = null;
  let errorCode: string | null = null;
  try {
    response = await provider.generate(input);
    errorCode = response.errorCode;
    if (!errorCode) {
      try {
        output = DraftOutput.parse(JSON.parse(response.text));
      } catch {
        errorCode = 'invalid_output';
      }
    }
    if (
      output?.request.lines.some(
        (line) => line.sku !== null && !pricing.rows.some((row) => row.id === line.sku),
      )
    ) {
      output = null;
      errorCode = 'unknown_catalogue_reference';
    }
  } catch (error) {
    errorCode = classifyProviderError(error);
  }
  return { startedAt, response, output, errorCode };
}

export type GeneratedDraft = Awaited<ReturnType<typeof generateDraft>>;

function classifyProviderError(error: unknown) {
  // Persist categories only: provider exceptions may contain private input or credentials.
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if (error instanceof OpenAI.APIConnectionTimeoutError || status === 408) return 'timeout';
  if (error instanceof OpenAI.APIConnectionError) return 'provider_connection';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'provider_auth';
  if (typeof status === 'number' && status >= 500) return 'provider_unavailable';
  return 'provider_error';
}
