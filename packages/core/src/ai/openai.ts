import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { DEFAULT_MODEL, DraftOutput, type DraftProvider } from './model.ts';

// Standard public endpoint pricing, USD per million tokens. Unknown overrides stay unpriced.
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
export function estimatedCost(model: string, input: number, cached: number, output: number) {
  if (model !== DEFAULT_MODEL || cached > input) return null;
  const nanoUsd = BigInt(input - cached) * 750n + BigInt(cached) * 75n + BigInt(output) * 4500n;
  return `${nanoUsd / 1000000000n}.${(nanoUsd % 1000000000n).toString().padStart(9, '0')}`;
}

export function createOpenAIProvider(apiKey: string, model = DEFAULT_MODEL): DraftProvider {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45000 });
  return {
    model,
    async generate(input) {
      // One bounded call; never allow SDK retries to create unrecorded spend.
      const response = await client.responses.create({
        model,
        store: false,
        max_output_tokens: 3000,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        text: { format: zodTextFormat(DraftOutput, 'enquiry_draft') },
      });
      const usage = response.usage;
      const refused = response.output.some(
        (entry) =>
          entry.type === 'message' && entry.content.some((part) => part.type === 'refusal'),
      );
      return {
        responseId: response.id,
        model: response.model,
        text: response.output_text,
        errorCode: refused ? 'refusal' : response.status !== 'completed' ? 'incomplete' : null,
        usage: usage
          ? {
              inputTokens: usage.input_tokens,
              cachedInputTokens: usage.input_tokens_details.cached_tokens,
              outputTokens: usage.output_tokens,
              estimatedCostUsd: estimatedCost(
                response.model,
                usage.input_tokens,
                usage.input_tokens_details.cached_tokens,
                usage.output_tokens,
              ),
            }
          : null,
      };
    },
  };
}
