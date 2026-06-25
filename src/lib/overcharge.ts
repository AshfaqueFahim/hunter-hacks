import { getIncrease, getOrder, type LeaseTerm, type RgbOrder } from './rgb';

export type LeaseEntry = {
  startDate: string;
  endDate: string;
  monthlyRent: number;
  leaseTermMonths: LeaseTerm;
  vacancyLease?: boolean;
};

export type EstimateInput = {
  history: LeaseEntry[];
  asOfDate?: string;
};

export type YearAnalysis = {
  year: number;
  lease_start: string;
  lease_end: string;
  term_months: LeaseTerm;
  allowed_pct: number | null;
  actual_pct: number | null;
  legal_monthly: number;
  actual_monthly: number;
  overcharge_monthly: number;
  months_in_lease: number;
  months_within_limit: number;
  overcharge_within_limit: number;
  vacancy_lease?: boolean;
};

// The very first lease on record — used as the legal-rent baseline and
// therefore deliberately EXCLUDED from `years_analyzed` below (the loop
// that builds years_analyzed starts at index 1; see `estimate()`). Any
// caller that needs the tenant's actual move-in date/rent (e.g. RA-89 §8)
// must read it from here, NOT from `years_analyzed[0]` — that's the
// second lease, not the first.
export type BaselineLease = {
  lease_start: string;
  lease_end: string;
  term_months: LeaseTerm;
  monthly_rent: number;
};

export type Estimate = {
  mode: 'history_only';
  legal_rent_monthly: number;
  actual_rent_monthly: number;
  overcharge_monthly: number;
  overcharge_total_within_limit: number;
  years_analyzed: YearAnalysis[];
  caveats: string[];
  baseline_lease: BaselineLease | null;
};

// HSTPA (2019) extended the overcharge lookback window from 4 to 6 years for
// complaints filed on or after 2019-06-14. Pre-HSTPA filings are reviewed under
// the prior 4-year rule, which we don't try to model here — the demo is for
// tenants filing today.
const STATUTE_YEARS = 6;
const HSTPA_EFFECTIVE_DATE = '2019-06-14';
const ROUND_CENTS = (n: number) => Math.round(n * 100) / 100;

function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}
// Parse ISO date (YYYY-MM-DD) into a UTC Date at midnight.

function isBeforeHstpa(dateIso: string): boolean {
  return parseDate(dateIso) < parseDate(HSTPA_EFFECTIVE_DATE);
}
// Return true when the given ISO date is before the HSTPA effective date.

function vacancyAllowedPct(order: RgbOrder, termMonths: LeaseTerm): number {
  if (termMonths === 24) return 20;
  const spread = order.two_year_pct - order.one_year_pct;
  return Math.max(0, 20 - spread);
}
// Compute the historical vacancy allowance percentage for the given RGB order and term.

function addYearsUtc(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}
// Add whole years to a Date using UTC fields (avoids timezone drift).

function monthsBetween(startIso: string, endIso: string): number {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  if (end <= start) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.4375));
}
// Approximate the number of months between two ISO dates (fractional allowed).

function monthsOverlapping(leaseStart: string, leaseEnd: string, windowStart: string): number {
  const startMs = Math.max(parseDate(leaseStart).getTime(), parseDate(windowStart).getTime());
  const endMs = parseDate(leaseEnd).getTime();
  if (endMs <= startMs) return 0;
  return (endMs - startMs) / (1000 * 60 * 60 * 24 * 30.4375);
}
// Return months of the lease that ovetarting at `windowStart`.rlap the statute window s

function sortHistory(history: LeaseEntry[]): LeaseEntry[] {
  return history.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
}
// Return a new array of leases sorted ascending by `startDate`.

function hasOverlappingLeases(history: LeaseEntry[]): boolean {
  const dates: string[] = [];
  for (const lease of history) {
    dates.push(lease.startDate, lease.endDate);
  }
  const sortedDates = [...dates].sort();
  return dates.some((date, i) => date !== sortedDates[i]);
}
// Lease start/end dates, taken in lease order, should already be sorted earliest to latest — if not, two leases overlap.

export function estimate(input: EstimateInput): Estimate {
  // Caveats shown on every estimate, regardless of input.
  const caveats: string[] = [
    'MCI (Major Capital Improvement) and IAI (Individual Apartment Improvement) increases are not modeled — these can legally raise the legal rent above what RGB alone would allow.',
    'Historical vacancy allowances before June 14, 2019 are modeled only for rows explicitly flagged as vacancy leases; after that date there is no separate vacancy bonus.',
    `Overcharge totals are limited to the ${STATUTE_YEARS}-year statute window prior to today (HSTPA, 2019).`,
  ];

  // Walk leases oldest-to-newest so each one builds on the prior legal rent.
  const fullHistory = sortHistory(input.history);
  if (fullHistory.length === 0) {
    return {
      mode: 'history_only',
      legal_rent_monthly: 0,
      actual_rent_monthly: 0,
      overcharge_monthly: 0,
      overcharge_total_within_limit: 0,
      years_analyzed: [],
      caveats: ['No lease history provided.', ...caveats],
      baseline_lease: null,
    };
  }

  if (hasOverlappingLeases(fullHistory)) {
    return {
      mode: 'history_only',
      legal_rent_monthly: 0,
      actual_rent_monthly: 0,
      overcharge_monthly: 0,
      overcharge_total_within_limit: 0,
      years_analyzed: [],
      caveats: ['There are overlapping leases, please check and submit again.', ...caveats],
      baseline_lease: null,
    };
  }

  const history = fullHistory;

  // The actual move-in lease — sorted earliest-first above, so this is
  // genuinely the first lease the tenant ever signed for this unit, NOT
  // `years_analyzed[0]` (which starts one lease later; see below).
  const baselineLease: BaselineLease = {
    lease_start: history[0].startDate,
    lease_end: history[0].endDate,
    term_months: history[0].leaseTermMonths,
    monthly_rent: history[0].monthlyRent,
  };

  // Statute window runs back STATUTE_YEARS from today (or the provided as-of date).
  const today = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const statuteStart = addYearsUtc(parseDate(today), -STATUTE_YEARS).toISOString().slice(0, 10);

  const years: YearAnalysis[] = [];
  const mode: 'history_only' = 'history_only';

  // First lease on record is taken as the legal rent baseline; we start comparing from the second.
  let prevLegalRent = history[0].monthlyRent;
  let startIndex = 1;
  caveats.unshift(
    'The first lease in your history is treated as the starting legal rent. If that first rent was itself an overcharge, this estimator cannot detect it.',
  );

  for (let i = startIndex; i < history.length; i++) {
    const lease = history[i];
    // Find the RGB order and allowed % increase in effect when this lease started.
    const order = getOrder(lease.startDate);
    const increase = getIncrease(lease.startDate, lease.leaseTermMonths);
    // Vacancy leases before HSTPA get the (often higher) vacancy allowance instead of the standard renewal increase.
    const allowedPct = lease.vacancyLease && order && isBeforeHstpa(lease.startDate)
      ? vacancyAllowedPct(order, lease.leaseTermMonths)
      : increase?.pct ?? null;

    // No data for this period? Carry the prior legal rent forward unchanged.
    const legalMonthly = allowedPct === null
      ? prevLegalRent
      : ROUND_CENTS(prevLegalRent * (1 + allowedPct / 100));

    // What the landlord actually raised the rent by, for comparison against allowedPct.
    const actualPct = prevLegalRent > 0
      ? ROUND_CENTS(((lease.monthlyRent - prevLegalRent) / prevLegalRent) * 100)
      : null;

    // No RGB data means no basis to call this an overcharge — don't flag or count it.
    const overchargeMonthly = allowedPct === null
      ? 0
      : Math.max(0, ROUND_CENTS(lease.monthlyRent - legalMonthly));
    const monthsInLease = monthsBetween(lease.startDate, lease.endDate);
    // Only the portion of the lease inside the statute window counts toward recoverable overcharge.
    const monthsWithinLimit = monthsOverlapping(lease.startDate, lease.endDate, statuteStart);
    const overchargeWithinLimit = ROUND_CENTS(overchargeMonthly * monthsWithinLimit);

    // Record this lease's full analysis for the per-year breakdown.
    years.push({
      year: parseDate(lease.startDate).getUTCFullYear(),
      lease_start: lease.startDate,
      lease_end: lease.endDate,
      term_months: lease.leaseTermMonths,
      allowed_pct: allowedPct,
      actual_pct: actualPct,
      legal_monthly: legalMonthly,
      actual_monthly: lease.monthlyRent,
      overcharge_monthly: overchargeMonthly,
      months_in_lease: ROUND_CENTS(monthsInLease),
      months_within_limit: ROUND_CENTS(monthsWithinLimit),
      overcharge_within_limit: overchargeWithinLimit,
      vacancy_lease: lease.vacancyLease ?? false,
    });

    // Surface a caveat whenever we had to fall back due to missing RGB data.
    if (allowedPct === null) {
      caveats.push(
        `No RGB order found for lease starting ${lease.startDate}; this lease was excluded from the overcharge calculation since the legal increase can't be determined.`,
      );
    }

    // This year's legal rent becomes next year's baseline.
    prevLegalRent = legalMonthly;
  }

  // Final lease in history determines the current legal vs. actual rent.
  const lastLease = history[history.length - 1];
  const lastAnalysis = years[years.length - 1];
  const legalRentMonthly = lastAnalysis ? lastAnalysis.legal_monthly : prevLegalRent;
  const actualRentMonthly = lastLease.monthlyRent;
  const overchargeMonthly = Math.max(0, ROUND_CENTS(actualRentMonthly - legalRentMonthly));
  // Sum each year's prorated overcharge to get the total recoverable within the statute window.
  const overchargeTotalWithinLimit = ROUND_CENTS(
    years.reduce((acc, y) => acc + y.overcharge_within_limit, 0),
  );

  return {
    mode,
    legal_rent_monthly: legalRentMonthly,
    actual_rent_monthly: actualRentMonthly,
    overcharge_monthly: overchargeMonthly,
    overcharge_total_within_limit: overchargeTotalWithinLimit,
    years_analyzed: years,
    caveats,
    baseline_lease: baselineLease,
  };
}
// Produce an `Estimate` from lease history: legal rents, per-year analyses, and overcharge totals.
