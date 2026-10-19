import { createHash } from 'node:crypto';
import type { Store } from './kv';

// Abuse and cost guards for the AI drafting endpoint.
//
// - Per-IP: DRAFTS_PER_HOUR drafts per fixed one-hour window. IPs are hashed
//   before they're used as keys, so raw IPs are never stored.
// - Global: AI_DAILY_CAP model calls per New York calendar day (default 200),
//   so a burst of traffic from many IPs still can't run up the bill.

export const DRAFTS_PER_HOUR = 5;
const DEFAULT_DAILY_CAP = 200;

export type LimitResult = { ok: boolean; count: number; limit: number };

export function clientIpKey(request: Request): string {
  // On Vercel, x-forwarded-for is set by the edge and its first entry is the
  // client IP. Locally it may be absent; everyone then shares one bucket.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';
  return createHash('sha256').update(`amirentstabilized:${ip}`).digest('hex').slice(0, 32);
}

export async function checkRateLimit(
  store: Store,
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<LimitResult> {
  const window = Math.floor(now.getTime() / 1000 / windowSeconds);
  const count = await store.incr(`rl:${bucket}:${key}:${window}`, windowSeconds);
  return { ok: count <= limit, count, limit };
}

export function dailyAiCap(): number {
  const raw = process.env.AI_DAILY_CAP;
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

function nycDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/** Counts one AI call against today's cap. */
export async function checkDailyAiCap(store: Store, now: Date = new Date()): Promise<LimitResult> {
  const limit = dailyAiCap();
  const count = await store.incr(`ai:calls:${nycDate(now)}`, 2 * 24 * 3600);
  return { ok: count <= limit, count, limit };
}
