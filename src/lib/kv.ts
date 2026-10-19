// Tiny key-value store used for rate limits, the daily AI cap and opt-in
// feedback contacts.
//
// Production: Upstash Redis over its REST API (free tier; install it from
// the Vercel Marketplace, which injects UPSTASH_REDIS_REST_URL/TOKEN — the
// legacy KV_REST_API_URL/TOKEN names are accepted too). No SDK dependency:
// it's two fetch calls.
//
// Fallback: an in-memory store. Fine for local dev, but on Vercel every
// serverless instance has its own memory, so limits become per-instance
// (weaker) and anything stored is lost on a cold start. `isDurable()` tells
// callers which one they've got.

export type Store = {
  /** Increment `key`, setting a TTL on first creation. Returns the new count. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  lpush(key: string, value: string): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
};

export function createMemoryStore(now: () => number = Date.now): Store {
  const counters = new Map<string, { n: number; expiresAt: number }>();
  const lists = new Map<string, string[]>();
  return {
    async incr(key, ttlSeconds) {
      const t = now();
      const cur = counters.get(key);
      if (!cur || cur.expiresAt <= t) {
        counters.set(key, { n: 1, expiresAt: t + ttlSeconds * 1000 });
        return 1;
      }
      cur.n += 1;
      return cur.n;
    },
    async lpush(key, value) {
      lists.set(key, [value, ...(lists.get(key) ?? [])]);
    },
    async lrange(key, start, stop) {
      const list = lists.get(key) ?? [];
      return list.slice(start, stop === -1 ? undefined : stop + 1);
    },
  };
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function createUpstashStore(cfg: { url: string; token: string }): Store {
  async function pipeline(commands: (string | number)[][]): Promise<{ result?: unknown; error?: string }[]> {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const failed = out.find((r) => r.error);
    if (failed) throw new Error(`Upstash error: ${failed.error}`);
    return out;
  }
  return {
    async incr(key, ttlSeconds) {
      const [incr] = await pipeline([
        ['INCR', key],
        ['EXPIRE', key, ttlSeconds, 'NX'],
      ]);
      return Number(incr.result);
    },
    async lpush(key, value) {
      await pipeline([['LPUSH', key, value]]);
    },
    async lrange(key, start, stop) {
      const [r] = await pipeline([['LRANGE', key, start, stop]]);
      return (r.result as string[]) ?? [];
    },
  };
}

// The memory store is a module-level singleton so counts persist across
// requests within one server instance.
let memory: Store = createMemoryStore();
let warned = false;

/**
 * The durable store if configured. If an Upstash call fails, the error is
 * logged and that one operation falls back to memory, so a Redis outage
 * degrades limits to per-instance rather than switching them off.
 */
export function getStore(): Store {
  const cfg = upstashConfig();
  if (!cfg) {
    if (!warned && process.env.VERCEL === '1') {
      console.warn('[kv] Upstash not configured — rate limits and the AI cap are per-instance only.');
      warned = true;
    }
    return memory;
  }
  const remote = createUpstashStore(cfg);
  const withFallback = <K extends keyof Store>(k: K) =>
    (async (...args: Parameters<Store[K]>) => {
      try {
        return await (remote[k] as (...a: Parameters<Store[K]>) => ReturnType<Store[K]>)(...args);
      } catch (err) {
        console.error(`[kv] Upstash ${k} failed; using in-memory fallback:`, err);
        return (memory[k] as (...a: Parameters<Store[K]>) => ReturnType<Store[K]>)(...args);
      }
    }) as Store[K];
  return { incr: withFallback('incr'), lpush: withFallback('lpush'), lrange: withFallback('lrange') };
}

export function isDurable(): boolean {
  return upstashConfig() !== null;
}

export function __resetStoreForTests(): void {
  memory = createMemoryStore();
}
