import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/lib/kv';
import {
  DRAFTS_PER_HOUR,
  checkDailyAiCap,
  checkRateLimit,
  clientIpKey,
  dailyAiCap,
} from '../src/lib/limits';

let store = createMemoryStore();
beforeEach(() => {
  store = createMemoryStore();
  delete process.env.AI_DAILY_CAP;
});

test('limits: per-IP draft limit allows 5 per hour, then blocks', async () => {
  assert.equal(DRAFTS_PER_HOUR, 5);
  const now = new Date('2026-10-18T15:10:00Z');
  for (let i = 0; i < 5; i++) {
    assert.equal((await checkRateLimit(store, 'draft', 'ip-a', DRAFTS_PER_HOUR, 3600, now)).ok, true);
  }
  assert.equal((await checkRateLimit(store, 'draft', 'ip-a', DRAFTS_PER_HOUR, 3600, now)).ok, false);
  // A different IP is unaffected.
  assert.equal((await checkRateLimit(store, 'draft', 'ip-b', DRAFTS_PER_HOUR, 3600, now)).ok, true);
  // The next hour window resets.
  const later = new Date('2026-10-18T16:00:01Z');
  assert.equal((await checkRateLimit(store, 'draft', 'ip-a', DRAFTS_PER_HOUR, 3600, later)).ok, true);
});

test('limits: daily AI cap defaults to 200 and reads AI_DAILY_CAP', () => {
  assert.equal(dailyAiCap(), 200);
  process.env.AI_DAILY_CAP = '3';
  assert.equal(dailyAiCap(), 3);
  process.env.AI_DAILY_CAP = 'nonsense';
  assert.equal(dailyAiCap(), 200);
});

test('limits: daily AI cap blocks once reached and resets on the next NYC day', async () => {
  process.env.AI_DAILY_CAP = '2';
  const day1 = new Date('2026-10-18T12:00:00Z');
  assert.equal((await checkDailyAiCap(store, day1)).ok, true);
  assert.equal((await checkDailyAiCap(store, day1)).ok, true);
  assert.equal((await checkDailyAiCap(store, day1)).ok, false);
  // 03:00 UTC on the 19th is still the 18th in New York.
  assert.equal((await checkDailyAiCap(store, new Date('2026-10-19T03:00:00Z'))).ok, false);
  assert.equal((await checkDailyAiCap(store, new Date('2026-10-19T05:00:00Z'))).ok, true);
});

test('limits: client IP is taken from x-forwarded-for and hashed, never stored raw', () => {
  const req = new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } });
  const key = clientIpKey(req);
  assert.ok(!key.includes('203.0.113.7'));
  assert.match(key, /^[a-f0-9]{16,}$/);
  const same = clientIpKey(new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.7' } }));
  assert.equal(key, same);
  assert.notEqual(
    key,
    clientIpKey(new Request('http://x/', { headers: { 'x-forwarded-for': '198.51.100.1' } })),
  );
});
