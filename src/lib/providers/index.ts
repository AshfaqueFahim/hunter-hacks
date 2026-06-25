// ──────────────────────────────────────────────────────────────────────
// Last stop before the actual model call. complaint.ts's streamComplaint()
// calls pickProvider() to get a concrete LLMProvider, then calls its
// .stream() method — this is the only file that decides openai-vs-anthropic;
// every caller upstream is provider-agnostic.
// ──────────────────────────────────────────────────────────────────────

import type { LLMProvider } from './types';
import { openAIProvider } from './openai';
import { anthropicProvider } from './anthropic';

export type { LLMProvider, LLMRequest } from './types';

/**
 * Pick a provider for /api/complaint. OpenAI is preferred when its key is set;
 * Anthropic is the fallback. Returns null if neither key is configured — the
 * route handler turns that into a 503 the UI can show.
 */
export function pickProvider(): LLMProvider | null {
  if (process.env.OPENAI_API_KEY) return openAIProvider;
  if (process.env.ANTHROPIC_API_KEY) return anthropicProvider;
  return null;
}
