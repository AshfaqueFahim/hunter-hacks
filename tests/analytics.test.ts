import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  boroughFromBbl,
  sanitizeProps,
  trackLanguageChanged,
  trackLookupRun,
  trackOverchargeCalculated,
  trackRa89DraftGenerated,
  trackVerdictShown,
} from '../src/lib/analytics';

type Call = { name: string; data?: Record<string, unknown> };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  (globalThis as unknown as { window: unknown }).window = {
    umami: { track: (name: string, data?: Record<string, unknown>) => calls.push({ name, data }) },
  };
});

test('analytics: borough is derived from the BBL prefix; the BBL itself is never sent', () => {
  assert.equal(boroughFromBbl('1010170001'), 'manhattan');
  assert.equal(boroughFromBbl('2'), 'bronx');
  assert.equal(boroughFromBbl('3012340056'), 'brooklyn');
  assert.equal(boroughFromBbl('4'), 'queens');
  assert.equal(boroughFromBbl('5000010001'), 'staten_island');
  assert.equal(boroughFromBbl('9999'), undefined);
  assert.equal(boroughFromBbl(undefined), undefined);

  trackVerdictShown('3012340056', 'stabilized');
  assert.deepEqual(calls, [{ name: 'verdict_shown', data: { borough: 'brooklyn', result: 'stabilized' } }]);
  assert.ok(!JSON.stringify(calls).includes('3012340056'));
});

test('analytics: sanitizeProps drops everything except borough, result, language', () => {
  const dirty = {
    borough: 'queens',
    result: 'not_found',
    language: 'bn',
    address: '350 West 50th Street, Manhattan',
    bbl: '1010170001',
    unit: '4B',
    rent: 2400,
    leaseStart: '2026-11-01',
  };
  assert.deepEqual(sanitizeProps(dirty), { borough: 'queens', result: 'not_found', language: 'bn' });
});

test('analytics: sanitizeProps rejects free-text values smuggled into allowed keys', () => {
  assert.deepEqual(
    sanitizeProps({ borough: '350 West 50th Street', result: '2400', language: '4B' }),
    {},
  );
});

test('analytics: each event sends only its allowed properties', () => {
  trackLookupRun();
  trackVerdictShown('1010170001', 'error');
  trackOverchargeCalculated('4000010001');
  trackRa89DraftGenerated('5000010001');
  trackLanguageChanged('es');
  assert.deepEqual(calls, [
    { name: 'lookup_run', data: {} },
    { name: 'verdict_shown', data: { borough: 'manhattan', result: 'error' } },
    { name: 'overcharge_calculated', data: { borough: 'queens' } },
    { name: 'ra89_draft_generated', data: { borough: 'staten_island' } },
    { name: 'language_changed', data: { language: 'es' } },
  ]);
});

test('analytics: no-op (and no throw) when the script is not loaded or there is no window', () => {
  (globalThis as unknown as { window: unknown }).window = {};
  assert.doesNotThrow(() => trackLookupRun());
  delete (globalThis as unknown as { window?: unknown }).window;
  assert.doesNotThrow(() => trackLanguageChanged('zh'));
});

test('analytics: feedback events send only useful=yes|no', async () => {
  const { trackFeedback } = await import('../src/lib/analytics');
  trackFeedback('verdict', true);
  trackFeedback('draft', false);
  assert.deepEqual(calls, [
    { name: 'verdict_feedback', data: { useful: 'yes' } },
    { name: 'draft_feedback', data: { useful: 'no' } },
  ]);
  assert.deepEqual(sanitizeProps({ useful: 'maybe', email: 'a@b.co' }), {});
});
