import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { buildings } from '@/lib/schema';

export type Verdict = {
  bbl: string;
  status: 'likely_stabilized' | 'not_listed' | 'unknown';
  unit_count_latest?: number;
  unit_count_year?: number;
  on_dhcr_list_latest: boolean;
  source_year_max?: number;
  dhcr_verify_url: string;
  // The building's ZIP, straight off the DOF-sourced row keyed by BBL.
  // The GeoSearch autocomplete address string never includes a ZIP (its
  // `label` is "{street}, {city}, {state}, USA"), so this is the only
  // place a default mailing ZIP for the subject building comes from.
  zipcode?: string;
};

const DHCR_URL = 'https://apps.hcr.ny.gov/BuildingSearch/default.aspx';

export function verdict(bbl: string): Verdict {
  const db = getDb();
  const rows = db.select().from(buildings).where(eq(buildings.bbl, bbl)).limit(1).all();

  if (rows.length === 0) {
    return {
      bbl,
      status: 'unknown',
      on_dhcr_list_latest: false,
      dhcr_verify_url: DHCR_URL,
    };
  }

  const row = rows[0];
  const isStabilized = (row.unitCountLatest ?? 0) > 0 || row.onDhcrListLatest === 1;

  return {
    bbl,
    status: isStabilized ? 'likely_stabilized' : 'not_listed',
    unit_count_latest: row.unitCountLatest ?? undefined,
    unit_count_year: row.unitCountYear ?? undefined,
    on_dhcr_list_latest: row.onDhcrListLatest === 1,
    source_year_max: row.sourceYearMax ?? undefined,
    dhcr_verify_url: DHCR_URL,
    zipcode: row.zipcode ?? undefined,
  };
}
