import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetStoreForTests, getStore } from '../src/lib/kv';
import { DRAFTS_PER_HOUR, checkRateLimit, clientIpKey } from '../src/lib/limits';
import { POST as complaintPOST } from '../src/app/api/complaint/route';
import { POST as feedbackPOST } from '../src/app/api/feedback/route';

const API_DIR = fileURLToPath(new URL('../src/app/api/', import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : p.endsWith('route.ts') ? [p] : [];
  });
}

beforeEach(() => {
  __resetStoreForTests();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
  delete process.env.AI_DAILY_CAP;
  delete process.env.FEEDBACK_ALLOW_MEMORY_STORE;
});

test('api: /api/debug is deleted', () => {
  assert.equal(existsSync(join(API_DIR, 'debug')), false);
});

test('api: no route returns stacks, raw error messages, debug bundles or validation internals', () => {
  const files = routeFiles(API_DIR);
  assert.ok(files.length >= 4);
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /debugDbBundle/, `${file}: debugDbBundle`);
    for (const m of src.matchAll(/Response\.json\(([\s\S]*?)\)\s*;/g)) {
      assert.doesNotMatch(
        m[1],
        /\.stack|err\.message|String\(err\)|debug|details|flatten\(\)|process\.cwd|_API_KEY/,
        `${file}: ${m[1].slice(0, 120)}`,
      );
    }
  }
});

const VALID_BODY = {
  verdict: {
    bbl: '1010130001',
    status: 'likely_stabilized',
    on_dhcr_list_latest: true,
    dhcr_verify_url: 'https://x',
  },
  estimate: {
    mode: 'history_only',
    legal_rent_monthly: 2000,
    actual_rent_monthly: 2050,
    overcharge_monthly: 50,
    overcharge_total_within_limit: 600,
    years_analyzed: [],
    caveats: [],
    baseline_lease: null,
  },
  address: '1 Main St, Manhattan',
};
const IP = '203.0.113.9';
const draftReq = () =>
  new Request('http://localhost/api/complaint', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
    body: JSON.stringify(VALID_BODY),
  });

test('api: complaint returns 429 rate_limited after 5 drafts per IP per hour', async () => {
  process.env.ANTHROPIC_API_KEY ||= 'test-key';
  const key = clientIpKey(draftReq());
  for (let i = 0; i < DRAFTS_PER_HOUR; i++) {
    await checkRateLimit(getStore(), 'draft', key, DRAFTS_PER_HOUR, 3600);
  }
  const res = await complaintPOST(draftReq());
  assert.equal(res.status, 429);
  assert.equal((await res.json()).code, 'rate_limited');
});

test('api: complaint returns 503 daily_cap once the daily AI cap is used up', async () => {
  process.env.ANTHROPIC_API_KEY ||= 'test-key';
  process.env.AI_DAILY_CAP = '0';
  const res = await complaintPOST(draftReq());
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'daily_cap');
});

const fbReq = (body: unknown) =>
  new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
    body: JSON.stringify(body),
  });

test('api: feedback stores only email + context + timestamp', async () => {
  process.env.FEEDBACK_ALLOW_MEMORY_STORE = '1';
  const res = await feedbackPOST(
    fbReq({ email: 'Tenant@Example.com ', context: 'draft', address: '1 Main St', bbl: '1010130001' }),
  );
  assert.equal(res.status, 200);
  const saved = await getStore().lrange('feedback:contacts', 0, -1);
  assert.equal(saved.length, 1);
  const row = JSON.parse(saved[0]);
  assert.deepEqual(Object.keys(row).sort(), ['at', 'context', 'email']);
  assert.equal(row.email, 'tenant@example.com');
  assert.equal(row.context, 'draft');
});

test('api: feedback rejects an invalid email', async () => {
  process.env.FEEDBACK_ALLOW_MEMORY_STORE = '1';
  const res = await feedbackPOST(fbReq({ email: 'not-an-email', context: 'verdict' }));
  assert.equal(res.status, 422);
});

test('api: feedback refuses emails when no durable store is configured', async () => {
  const res = await feedbackPOST(fbReq({ email: 'a@b.co', context: 'verdict' }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'storage_unavailable');
});
