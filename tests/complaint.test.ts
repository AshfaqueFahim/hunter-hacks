import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFieldMap, type ComplaintInput } from '../src/lib/complaint';
import type { Verdict } from '../src/lib/stabilization';
import type { Estimate } from '../src/lib/overcharge';

const VERDICT: Verdict = {
  bbl: '1010130001',
  status: 'likely_stabilized',
  unit_count_latest: 24,
  unit_count_year: 2023,
  on_dhcr_list_latest: true,
  source_year_max: 2023,
  dhcr_verify_url: 'https://apps.hcr.ny.gov/BuildingSearch/default.aspx',
};

const ESTIMATE: Estimate = {
  mode: 'history_only',
  legal_rent_monthly: 2060,
  actual_rent_monthly: 2200,
  overcharge_monthly: 140,
  overcharge_total_within_limit: 1680,
  years_analyzed: [
    {
      year: 2023,
      lease_start: '2023-10-01',
      lease_end: '2024-09-30',
      term_months: 12,
      allowed_pct: 3.0,
      actual_pct: 10.0,
      legal_monthly: 2060,
      actual_monthly: 2200,
      overcharge_monthly: 140,
      months_in_lease: 12,
      months_within_limit: 12,
      overcharge_within_limit: 1680,
    },
  ],
  caveats: ['MCI/IAI not modeled.'],
  baseline_lease: {
    lease_start: '2022-10-01',
    lease_end: '2023-09-30',
    term_months: 12,
    monthly_rent: 2000,
  },
};

const INPUT: ComplaintInput = {
  verdict: VERDICT,
  estimate: ESTIMATE,
  address: '350 W 50th St, New York, NY 10019',
};

test('buildFieldMap: missing tenant name and unit fall back to placeholders', () => {
  const fields = buildFieldMap(INPUT);
  assert.equal(fields.tenant_name, '[YOUR NAME]');
  assert.equal(fields.unit, '[UNIT #]');
  assert.equal(fields.address, INPUT.address);
  assert.equal(fields.bbl, VERDICT.bbl);
});

test('buildFieldMap: provided tenant name and unit are passed through', () => {
  const fields = buildFieldMap({ ...INPUT, tenantName: 'Jane Tenant', unit: '4B' });
  assert.equal(fields.tenant_name, 'Jane Tenant');
  assert.equal(fields.unit, '4B');
});

test('buildFieldMap: whitespace-only tenant name falls back to placeholder', () => {
  const fields = buildFieldMap({ ...INPUT, tenantName: '   ', unit: '\t' });
  assert.equal(fields.tenant_name, '[YOUR NAME]');
  assert.equal(fields.unit, '[UNIT #]');
});

test('buildFieldMap: monetary fields are passed through unchanged', () => {
  const fields = buildFieldMap(INPUT);
  assert.equal(fields.legal_rent_monthly, 2060);
  assert.equal(fields.actual_rent_monthly, 2200);
  assert.equal(fields.overcharge_monthly, 140);
  assert.equal(fields.overcharge_total_within_limit, 1680);
});

test('buildFieldMap: filing URL points to a valid DHCR page (not the 404 path)', () => {
  const fields = buildFieldMap(INPUT);
  assert.match(fields.filing_url, /^https:\/\/(hcr|rent)\.ny\.gov\//);
  assert.ok(
    !fields.filing_url.endsWith('/forms-publications'),
    'filing_url must not point to the deprecated /forms-publications path',
  );
});
