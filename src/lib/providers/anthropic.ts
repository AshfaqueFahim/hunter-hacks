import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRequest } from './types';

const MODEL = 'claude-sonnet-4-6';

// Used only when OPENAI_API_KEY is absent (see pickProvider() in index.ts).
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
  client = new Anthropic({ apiKey });
  return client;
}

// Same job as openai.ts's streamText: adapt this SDK's streaming shape
// to the provider-agnostic AsyncGenerator<string> contract.
async function* streamText(req: LLMRequest): AsyncGenerator<string> {
  const stream = getClient().messages.stream(
    {
      model: MODEL,
      max_tokens: req.maxTokens,
      system: [
        {
          type: 'text',
          text: req.systemPrompt,
          // Ephemeral cache: every complaint reuses the system prompt verbatim,
          // so the cache hit zeroes the prefill cost on re-runs within the TTL.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: req.userMessage }],
    },
    { signal: req.signal },
  );

  // The Anthropic stream emits multiple event types (message_start,
  // content_block_start, ...); the only one carrying actual generated
  // text is a content_block_delta whose delta is a text_delta.
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

export const anthropicProvider: LLMProvider = {
  name: 'anthropic',
  model: MODEL,
  stream: streamText,
};
