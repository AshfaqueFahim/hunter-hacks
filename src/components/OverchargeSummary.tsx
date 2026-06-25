import type { Estimate } from '@/lib/overcharge';

type Props = {
  estimate: Estimate;
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtCents = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const fmtPct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}%`);

function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function monthsBetween(startIso: string, endIso: string): number {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (end <= start) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
}

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

export default function OverchargeSummary({ estimate }: Props) {
  const hasOvercharge = estimate.overcharge_total_within_limit > 0;
  const today = new Date().toISOString().slice(0, 10);
  const currentOverchargeTotal = estimate.years_analyzed.reduce((acc, year) => {
    if (year.lease_start >= today) return acc;
    const overlapEnd = minIso(year.lease_end, today);
    const monthsSoFar = monthsBetween(year.lease_start, overlapEnd);
    const amount = Math.max(0, Math.round(monthsSoFar * year.overcharge_monthly * 100) / 100);
    return acc + amount;
  }, 0);
  const firstOverchargeLeaseStart = estimate.years_analyzed.find((year) => year.overcharge_monthly > 0)?.lease_start ?? null;
  const stripBg = hasOvercharge ? 'bg-rust' : 'bg-verdigris';
  const pillBg = hasOvercharge ? 'bg-rust' : 'bg-verdigris';
  const pillText = 'text-bone';

  return (
    <section className="paper relative overflow-hidden animate-fade-in-up">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${stripBg}`} />
      <div className="px-6 sm:px-8 pt-6 pb-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="eyebrow">Section III · Estimate</span>
            <h2 className="mt-1.5 font-display text-[28px] sm:text-[32px] leading-[1.05] tracking-tight text-ink-text">
              {hasOvercharge ? (
                <>
                  <span className="block text-secondary text-base font-sans tracking-normal mb-1">
                    You’ve been overcharged {fmt(currentOverchargeTotal)} as of today. If this remains unchecked, the first rent hike that becomes actionable starts with the lease beginning on {firstOverchargeLeaseStart ?? 'the first overcharged renewal'}, and you are set to be overcharged {fmt(estimate.overcharge_total_within_limit)} by the end of your final lease.
                  </span>
                  <span className="text-rust tabular">{fmt(estimate.overcharge_total_within_limit)}</span>
                </>
              ) : (
                <>
                  <span className="block text-secondary text-base font-sans tracking-normal mb-1">
                    No overcharge detected
                  </span>
                  <span className="text-verdigris">All within RGB increase limits.</span>
                </>
              )}
            </h2>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${pillBg} ${pillText}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {hasOvercharge ? 'Overcharge' : 'Within bounds'}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-px bg-rule rounded-[10px] overflow-hidden border border-rule">
          <Stat
            label="Your current rent"
            value={fmtCents(estimate.actual_rent_monthly)}
            unit="/mo"
          />
          <Stat
            label="Estimated legal rent"
            value={fmtCents(estimate.legal_rent_monthly)}
            unit="/mo"
            tone="brass"
          />
          <Stat
            label="Monthly overcharge"
            value={fmtCents(estimate.overcharge_monthly)}
            unit="/mo"
            tone={hasOvercharge ? 'rust' : 'muted'}
          />
        </div>

        {estimate.years_analyzed.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="eyebrow">Per-renewal breakdown</span>
              <span className="h-px flex-1 bg-rule" />
            </div>
            <div className="overflow-x-auto rounded-[10px] border border-rule bg-paper-soft">
              <table className="w-full border-collapse text-sm tabular">
                <thead>
                  <tr className="text-left">
                    <Th>Lease start</Th>
                    <Th>Term</Th>
                    <Th align="right">Allowed</Th>
                    <Th align="right">Actual</Th>
                    <Th align="right">Legal rent</Th>
                    <Th align="right">Actual rent</Th>
                    <Th align="right">Overcharge / mo</Th>
                    <Th align="right">In 6-yr window</Th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.years_analyzed.map((y, idx) => {
                    const over = y.overcharge_monthly > 0;
                    const inWindow = y.overcharge_within_limit > 0;
                    return (
                      <tr
                        key={y.lease_start}
                        className={`border-t border-rule/70 ${idx % 2 === 0 ? 'bg-bone/40' : ''}`}
                      >
                        <Td>{y.lease_start}</Td>
                        <Td>{y.term_months === 24 ? '2-yr' : '1-yr'}</Td>
                        <Td align="right">{fmtPct(y.allowed_pct)}</Td>
                        <Td align="right" className={
                          y.actual_pct !== null && y.allowed_pct !== null && y.actual_pct > y.allowed_pct
                            ? 'text-rust font-semibold' : ''
                        }>{fmtPct(y.actual_pct)}</Td>
                        <Td align="right">{fmtCents(y.legal_monthly)}</Td>
                        <Td align="right">{fmtCents(y.actual_monthly)}</Td>
                        <Td align="right" className={over ? 'text-rust font-semibold' : 'text-muted'}>
                          {over ? fmtCents(y.overcharge_monthly) : '—'}
                        </Td>
                        <Td align="right" className={inWindow ? 'text-rust font-semibold' : 'text-muted'}>
                          {inWindow ? fmtCents(y.overcharge_within_limit) : '—'}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {estimate.caveats.length > 0 && (
          <details className="mt-5 group">
            <summary className="cursor-pointer flex items-center gap-2 text-xs">
              <span className="eyebrow">Caveats and assumptions</span>
              <span className="h-px flex-1 bg-rule" />
              <span className="text-muted text-[10px]">{estimate.caveats.length} notes</span>
              <svg className="h-3 w-3 text-muted transition-transform group-open:rotate-180" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <ul className="mt-2 space-y-1.5 pl-1">
              {estimate.caveats.map((c, i) => (
                <li key={i} className="flex gap-2 text-xs text-secondary leading-relaxed">
                  <span className="text-brass mt-0.5 flex-shrink-0">§</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          Estimate only — not legal advice. To confirm the starting legal rent, request your
          apartment’s rent history via{' '}
          <a
            href="https://hcr.ny.gov/records-access"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-brass/40 underline-offset-2 hover:text-brass-deep hover:decoration-brass"
          >
            DHCR Records Access (Form REC-1)
          </a>
          . This is not a law firm and use of this tool does not create an attorney-client
          relationship. Not affiliated with or endorsed by DHCR or any NY state agency.
        </p>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'brass' | 'rust' | 'muted';
}) {
  const valueClass =
    tone === 'rust'
      ? 'text-rust'
      : tone === 'brass'
      ? 'text-brass-deep'
      : tone === 'muted'
      ? 'text-muted'
      : 'text-ink-text';
  return (
    <div className="bg-bone p-4">
      <div className="eyebrow">{label}</div>
      <div className={`mt-1.5 font-display text-[26px] leading-none tabular ${valueClass}`}>
        {value}
        {unit && <span className="font-sans text-sm text-muted font-normal ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-3 py-2 eyebrow font-semibold text-[10px] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 text-ink-text ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}
