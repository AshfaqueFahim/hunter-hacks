import OpenAI from 'openai';
import type { LLMProvider, LLMRequest } from './types';

// gpt-4o has reliable structured-output behavior, prompt caching auto-applies
// for prefixes >1024 tokens, and pricing is well below gpt-5 for the few-K
// tokens this prompt produces. The system prompt sits >1024 tokens so we
// realize the cached-input discount on every retry.
const MODEL = 'gpt-4o';

// Lazily constructed + cached across calls within the same server
// process — avoids re-reading the env var and re-constructing the SDK
// client on every single complaint draft.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  client = new OpenAI({ apiKey });
  return client;
}

// Thin wrapper around OpenAI's streaming chat-completions API that
// re-shapes it to the LLMProvider['stream'] contract: an AsyncGenerator
// yielding plain text deltas (no SSE envelope, no role/finish_reason
// bookkeeping) — that's all complaint.ts's streamComplaint() forwards on.
async function* streamText(req: LLMRequest): AsyncGenerator<string> {
  const stream = await getClient().chat.completions.create(
    {
      model: MODEL,
      max_tokens: req.maxTokens,
      temperature: 0.3,
      stream: true,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userMessage },
      ],
    },
    { signal: req.signal },
  );

  // Each streamed chunk can contain zero or one content delta (plus
  // role/finish_reason metadata we don't care about) — only forward
  // chunks that actually carry text.
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      yield delta;
    }
  }
}

export const openAIProvider: LLMProvider = {
  name: 'openai',
  model: MODEL,
  stream: streamText,
};
