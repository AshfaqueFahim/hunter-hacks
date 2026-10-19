'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import Footer from '@/components/Footer';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n';
import { latestOrderNo } from '@/lib/rgb';

/* ============================================================================
   /info — an editorial, scrollytelling explanation of NYC rent stabilization.

   Hooks (intersection-driven) and the SVG charts are local to this file by
   design: this is a one-page editorial spread, and inlining keeps the visual
   choices, the copy, and the timing of the narrative all in one place.
   ============================================================================ */

/* ----------------------------- hooks -------------------------------------- */

/** True once the element has crossed `threshold` of viewport visibility. */
function useInView<T extends Element>(threshold = 0.25, once = true) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);
  return { ref, inView };
}

/**
 * Tracks which "step" of a scrollytelling section is currently centered in
 * the viewport. Each step element registers itself via the returned setRef(i).
 *
 * The per-index ref callbacks are memoized so React doesn't detach/re-attach
 * the IntersectionObserver every render.
 */
function useScrollSteps(stepCount: number) {
  const [active, setActive] = useState(0);
  const elsRef = useRef(new Map<number, HTMLElement>());

  const refCallbacks = useMemo(
    () =>
      Array.from({ length: stepCount }, (_, idx) => (el: HTMLElement | null) => {
        if (el) {
          el.dataset.scrollStep = String(idx);
          elsRef.current.set(idx, el);
        } else {
          elsRef.current.delete(idx);
        }
      }),
    [stepCount],
  );

  const setRef = useCallback((idx: number) => refCallbacks[idx], [refCallbacks]);

  useEffect(() => {
    const ratios = new Array(stepCount).fill(0);
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.scrollStep);
          if (Number.isFinite(idx)) ratios[idx] = e.intersectionRatio;
        }
        let max = 0;
        let next = -1;
        ratios.forEach((v, i) => {
          if (v > max) {
            max = v;
            next = i;
          }
        });
        // If no step is currently inside the rootMargin band, keep the last
        // active step instead of snapping back to 0 — otherwise the chart
        // briefly loses state in the gaps between step elements.
        if (next !== -1) setActive(next);
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '-35% 0px -35% 0px',
      },
    );
    elsRef.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [stepCount]);

  return { active, setRef };
}

/** Reading progress (0–1) across the page. */
function useReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      setProgress(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return progress;
}

/* ----------------------------- helpers ------------------------------------ */

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/* ----------------------------- viz: dot matrix ---------------------------- */

/**
 * 10×10 grid (100 dots = 100% of NYC's roughly 2.3M rental units).
 * Each step paints a different slice in brass.
 */
function DotMatrix({ activeStep }: { activeStep: number }) {
  const total = 100;
  // ~44/100 stabilized (≈1M of ~2.3M rentals — Furman Center / NYU surveys).
  const stabilized = 44;
  // public + project-based subsidy comparison: ~7/100 (NYCHA ≈170k units).
  const subsidized = 7;

  const dots = useMemo(() => Array.from({ length: total }, (_, i) => i), []);

  function colorFor(i: number) {
    if (activeStep === 0) return 'rule';                          // all rentals
    if (activeStep === 1) return i < stabilized ? 'brass' : 'rule'; // stabilized
    if (activeStep === 2) return i < subsidized ? 'verdigris' : i < stabilized ? 'brass' : 'rule';
    return i < stabilized ? 'brass' : 'rule';
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-10 gap-2 sm:gap-2.5">
        {dots.map((i) => {
          const c = colorFor(i);
          const fill =
            c === 'brass'
              ? 'bg-brass shadow-[0_0_0_1px_rgba(135,90,13,0.25)]'
              : c === 'verdigris'
                ? 'bg-verdigris shadow-[0_0_0_1px_rgba(47,107,89,0.3)]'
                : 'bg-paper-deep border border-rule';
          // diagonal stagger: top-left tiles flip before bottom-right
          const row = Math.floor(i / 10);
          const col = i % 10;
          return (
            <span
              key={i}
              className={`aspect-square rounded-[3px] transition-colors duration-500 ${fill}`}
              style={{ transitionDelay: `${(row + col) * 14}ms` }}
            />
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
        <LegendDot color="bg-brass" label="Rent-stabilized" />
        <LegendDot color="bg-verdigris" label="Public / subsidized" />
        <LegendDot color="bg-paper-deep border border-rule" label="Market-rate / other" />
      </div>

      <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        1 dot ≈ 23,000 NYC rental homes
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-secondary">
      <span className={`h-2.5 w-2.5 rounded-[2px] ${color}`} />
      {label}
    </span>
  );
}

/* ----------------------------- viz: line chart ---------------------------- */

type Point = { year: number; legal: number; actual: number };

// Illustrative 10-year lease — modeled on real RGB renewal increases.
const LEASE: Point[] = [
  { year: 1,  legal: 2000, actual: 2000 },
  { year: 2,  legal: 2030, actual: 2150 },
  { year: 3,  legal: 2071, actual: 2300 },
  { year: 4,  legal: 2122, actual: 2450 },
  { year: 5,  legal: 2186, actual: 2600 },
  { year: 6,  legal: 2218, actual: 2700 },
  { year: 7,  legal: 2263, actual: 2800 },
  { year: 8,  legal: 2319, actual: 2900 },
  { year: 9,  legal: 2389, actual: 3000 },
  { year: 10, legal: 2461, actual: 3100 },
];

function LineChart({ activeStep }: { activeStep: number }) {
  // visible years per step — narrative reveal
  const visibleYears = [2, 2, 5, 5, 10][activeStep] ?? 10;
  const showActual = activeStep >= 1;
  const showGap = activeStep >= 3;
  const showStatuteShade = activeStep >= 4;

  // chart geometry (viewBox)
  const W = 640;
  const H = 360;
  const padL = 56;
  const padR = 24;
  const padT = 28;
  const padB = 44;
  const yMin = 1900;
  const yMax = 3200;

  const x = (yr: number) => padL + ((yr - 1) / (LEASE.length - 1)) * (W - padL - padR);
  const y = (val: number) =>
    padT + ((yMax - val) / (yMax - yMin)) * (H - padT - padB);

  const sliced = LEASE.slice(0, visibleYears);
  const legalPath = sliced.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.year)} ${y(p.legal)}`).join(' ');
  const actualPath = sliced
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.year)} ${y(p.actual)}`)
    .join(' ');
  const gapPath =
    sliced.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.year)} ${y(p.actual)}`).join(' ') +
    ' ' +
    sliced
      .slice()
      .reverse()
      .map((p) => `L ${x(p.year)} ${y(p.legal)}`)
      .join(' ') +
    ' Z';

  // statute shading: 6-year window measured from the latest visible year
  const lastYear = sliced.length ? sliced[sliced.length - 1].year : 0;
  const statuteStart = Math.max(1, lastYear - 5);
  const statuteX = x(statuteStart);
  const statuteW = x(lastYear) - statuteX;

  // overcharge total over visible window
  const overcharge = sliced.reduce((sum, p) => sum + Math.max(0, p.actual - p.legal) * 12, 0);
  const recoverable = sliced
    .filter((p) => p.year >= statuteStart)
    .reduce((sum, p) => sum + Math.max(0, p.actual - p.legal) * 12, 0);

  return (
    <div className="rounded-[14px] border border-rule bg-bone p-5 shadow-[0_18px_40px_-22px_rgba(20,14,6,0.25)]">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Hypothetical lease · 10 years</span>
        <span className="font-mono text-[10px] text-muted">illustrative · not real data</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full h-auto" role="img" aria-label="Legal rent vs. actual rent over a hypothetical 10-year lease.">
        <defs>
          <linearGradient id="gap-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--rust)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--rust)" stopOpacity="0.02" />
          </linearGradient>
          <pattern id="statute-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--brass)" strokeOpacity="0.18" strokeWidth="2" />
          </pattern>
        </defs>

        {/* y-axis grid */}
        {[2000, 2400, 2800, 3200].map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--rule)"
              strokeDasharray="2 4"
            />
            <text x={padL - 8} y={y(g) + 3} textAnchor="end" className="fill-muted" fontSize="10" fontFamily="ui-monospace, SFMono-Regular, monospace">
              ${g.toLocaleString()}
            </text>
          </g>
        ))}

        {/* x-axis */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--rule-strong)" strokeWidth="1" />
        {LEASE.map((p) => (
          <text
            key={p.year}
            x={x(p.year)}
            y={H - padB + 16}
            textAnchor="middle"
            className="fill-muted"
            fontSize="10"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            Y{p.year}
          </text>
        ))}

        {/* statute window shading (HSTPA 6-year lookback) */}
        {showStatuteShade && statuteW > 0 && (
          <g>
            <rect
              x={statuteX}
              y={padT}
              width={statuteW}
              height={H - padT - padB}
              fill="url(#statute-hatch)"
            />
            <text
              x={statuteX + statuteW / 2}
              y={padT + 14}
              textAnchor="middle"
              className="fill-brass-deep"
              fontSize="10"
              fontWeight="600"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              letterSpacing="0.08em"
            >
              HSTPA · 6-YEAR WINDOW
            </text>
          </g>
        )}

        {/* gap fill */}
        {showGap && (
          <path d={gapPath} fill="url(#gap-grad)" stroke="none" />
        )}

        {/* legal rent line */}
        <path
          d={legalPath}
          fill="none"
          stroke="var(--brass-deep)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {sliced.map((p) => (
          <circle key={`l-${p.year}`} cx={x(p.year)} cy={y(p.legal)} r="3" fill="var(--brass-deep)" />
        ))}

        {/* actual rent line */}
        {showActual && (
          <>
            <path
              d={actualPath}
              fill="none"
              stroke="var(--rust)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={activeStep === 1 ? '4 5' : undefined}
            />
            {sliced.map((p) => (
              <circle key={`a-${p.year}`} cx={x(p.year)} cy={y(p.actual)} r="3" fill="var(--rust)" />
            ))}
          </>
        )}

        {/* end-of-line labels */}
        {visibleYears > 0 && (
          <>
            <text
              x={x(sliced[sliced.length - 1].year) + 8}
              y={y(sliced[sliced.length - 1].legal) + 3}
              className="fill-brass-deep"
              fontSize="11"
              fontWeight="600"
            >
              Legal · {usd(sliced[sliced.length - 1].legal)}
            </text>
            {showActual && (
              <text
                x={x(sliced[sliced.length - 1].year) + 8}
                y={y(sliced[sliced.length - 1].actual) + 3}
                className="fill-rust"
                fontSize="11"
                fontWeight="600"
              >
                Actual · {usd(sliced[sliced.length - 1].actual)}
              </text>
            )}
          </>
        )}
      </svg>

      <div className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
        <ChartStat label="Months elapsed" value={`${visibleYears * 12}`} mono tone="ink" />
        <ChartStat
          label="Cumulative overcharge"
          value={overcharge > 0 ? usd(overcharge) : '—'}
          tone={overcharge > 0 ? 'rust' : 'muted'}
        />
        <ChartStat
          label="Within statute"
          value={recoverable > 0 ? usd(recoverable) : '—'}
          tone={recoverable > 0 ? 'verdigris' : 'muted'}
        />
      </div>
    </div>
  );
}

function ChartStat({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone: 'ink' | 'rust' | 'verdigris' | 'muted';
  mono?: boolean;
}) {
  const color =
    tone === 'rust'
      ? 'text-rust'
      : tone === 'verdigris'
        ? 'text-verdigris'
        : tone === 'muted'
          ? 'text-muted'
          : 'text-ink-text';
  return (
    <div className="rounded-[8px] border border-rule/70 bg-paper-soft px-3 py-2">
      <div className="eyebrow text-[10px]">{label}</div>
      <div className={`mt-0.5 font-display text-base tabular ${mono ? 'font-mono' : ''} ${color}`}>{value}</div>
    </div>
  );
}

/* ----------------------------- viz: timeline ------------------------------ */

function StatuteTimeline() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const total = 12; // years displayed
  const lookback = 6; // recoverable

  return (
    <div ref={ref} className="rounded-[14px] border border-rule bg-bone p-5 sm:p-7">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Statute of limitations</span>
        <span className="font-mono text-[10px] text-muted">HSTPA · enacted June 14, 2019</span>
      </div>
      <h3 className="mt-2 font-display text-[26px] sm:text-[30px] leading-tight text-ink-text">
        The clock that decides what counts.
      </h3>

      <div className="relative mt-7 h-24">
        {/* axis */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-rule-strong" />

        {/* expired range */}
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-l-full bg-paper-deep border border-rule"
          style={{
            left: 0,
            width: inView ? `${((total - lookback) / total) * 100}%` : '0%',
            transition: 'width 1.1s cubic-bezier(0.2,0.7,0.2,1)',
          }}
        />
        {/* claimable range */}
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-r-full bg-gradient-to-r from-brass-glow to-brass shadow-[0_0_0_1px_rgba(135,90,13,0.35)]"
          style={{
            left: `${((total - lookback) / total) * 100}%`,
            width: inView ? `${(lookback / total) * 100}%` : '0%',
            transition: 'width 1.1s cubic-bezier(0.2,0.7,0.2,1) 0.2s',
          }}
        />

        {/* tick marks + labels */}
        {Array.from({ length: total + 1 }, (_, i) => {
          const pct = (i / total) * 100;
          const yearsAgo = total - i;
          const isToday = i === total;
          const isCutoff = i === total - lookback;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pct}%` }}
            >
              <div
                className={`h-4 w-px ${isToday ? 'bg-ink-text' : isCutoff ? 'bg-brass-deep' : 'bg-rule-strong'}`}
              />
              {(i % 2 === 0 || isCutoff) && (
                <div
                  className={`absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] ${
                    isToday ? 'text-ink-text font-semibold' : isCutoff ? 'text-brass-deep font-semibold' : 'text-muted'
                  }`}
                >
                  {isToday ? 'today' : `−${yearsAgo}y`}
                </div>
              )}
              {isCutoff && (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-brass-deep">
                  ← claim cutoff
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px] leading-relaxed text-secondary">
        <div className="rounded-[10px] border border-rule/70 bg-paper-soft px-4 py-3">
          <div className="eyebrow text-[10px]">Before HSTPA (≤ June 2019)</div>
          <p className="mt-1 text-ink-text font-display text-[15px] leading-snug">
            Four-year lookback. Most claims expired before tenants ever knew to file.
          </p>
        </div>
        <div className="rounded-[10px] border border-brass/40 bg-brass-wash px-4 py-3">
          <div className="eyebrow text-[10px] text-brass-deep">After HSTPA</div>
          <p className="mt-1 text-ink-text font-display text-[15px] leading-snug">
            Six years recoverable, plus treble damages for willful overcharges.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- pull-quote --------------------------------- */

function PullQuote({
  children,
  cite,
}: {
  children: ReactNode;
  cite: ReactNode;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  return (
    <figure
      ref={ref}
      className={`my-14 transition-all duration-700 ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="border-l-2 border-brass pl-6 sm:pl-8">
        <span aria-hidden className="block font-display italic text-brass-deep text-5xl leading-none">
          &ldquo;
        </span>
        <blockquote className="mt-1 font-display text-[24px] sm:text-[30px] leading-[1.18] tracking-[-0.012em] text-ink-text italic">
          {children}
        </blockquote>
        <figcaption className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted">
          {cite}
        </figcaption>
      </div>
    </figure>
  );
}

/* ----------------------------- counter ------------------------------------ */

/**
 * The awareness-gap beat: a donut chart sliced 25% / 75%. The brass quarter
 * draws on enter via stroke-dasharray; "1 in 4" sits centered in the hole.
 */
function OneInFourCallout() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);

  const cx = 100;
  const cy = 100;
  const r = 78;
  const stroke = 36;
  const c = 2 * Math.PI * r;
  const quarter = c / 4;

  return (
    <div
      ref={ref}
      className={`flex flex-col items-center text-center transition-all duration-700 ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      <div className="relative w-[240px] h-[240px] sm:w-[300px] sm:h-[300px] lg:w-[340px] lg:h-[340px]">
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full -rotate-90"
          role="img"
          aria-label="One in four — pie chart"
        >
          {/* the 3/4 majority — those who knew */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--paper-deep)"
            strokeWidth={stroke}
          />
          {/* the 1/4 slice — those who didn't.
              animates in via stroke-dasharray on enter */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--brass-deep)"
            strokeWidth={stroke}
            strokeDasharray={`${inView ? quarter : 0} ${c}`}
            style={{ transition: 'stroke-dasharray 1200ms cubic-bezier(0.2,0.7,0.2,1)' }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-baseline gap-1.5 font-display tabular tracking-[-0.02em] leading-none">
            <span className="text-[44px] sm:text-[58px] lg:text-[68px] text-brass-deep">1</span>
            <span className="italic text-[20px] sm:text-[26px] lg:text-[30px] text-muted">in</span>
            <span className="text-[44px] sm:text-[58px] lg:text-[68px] text-ink-text">4</span>
          </span>
        </div>
      </div>
      <div className="mt-6 eyebrow">Didn&rsquo;t know their apartment was regulated</div>
    </div>
  );
}

/* ============================================================================
   Page
   ============================================================================ */

export default function InfoStory() {
  const { t, locale } = useI18n();
  const reading = useReadingProgress();

  // Section 1 — scale (3 beats)
  const scaleSteps = useScrollSteps(3);
  // Section 3 — overcharge mechanics (5 beats)
  const overSteps = useScrollSteps(5);

  return (
    <div className="min-h-screen bg-paper">
      {/* reading progress */}
      <div
        aria-hidden
        className="fixed left-0 top-0 z-50 h-[2px] bg-brass origin-left"
        style={{ transform: `scaleX(${reading})`, width: '100%', transition: 'transform 80ms linear' }}
      />

      {/* header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-paper/85 border-b border-rule/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="group flex items-baseline -ml-0.5 pr-1">
            <span className="font-display text-[17px] sm:text-[20px] font-semibold tracking-tight text-ink-text group-hover:text-brass-deep transition-colors whitespace-nowrap pr-0.5">
              {t('app.title')}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-secondary hover:bg-paper-soft hover:text-ink-text transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7.5 2.5L4 6l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('nav.home')}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* The long-form story below is English-only for now — flag that for
          readers browsing in another language. */}
      {locale !== 'en' && (
        <div className="border-b border-rule bg-brass-wash/60">
          <p className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 text-xs text-secondary">
            {t('story.englishOnly')}
          </p>
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-rule">
        <div className="absolute inset-0 blueprint-grid opacity-40" aria-hidden />
        <div className="absolute inset-0 paper-grain opacity-50" aria-hidden />
        <div
          aria-hidden
          className="absolute -top-32 -right-24 h-[460px] w-[460px] rounded-full bg-brass-glow/20 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-5 sm:px-8 lg:px-10 pt-20 sm:pt-28 pb-20 sm:pb-28">
          <span className="eyebrow flex items-center gap-2">
            <span className="h-px w-6 bg-brass" /> Vol. I · Field Notes
            <span className="h-px flex-1 bg-rule max-w-[120px]" />
            <span className="font-mono text-[10px] text-muted normal-case tracking-normal">
              amirentstabilized.nyc · Editorial
            </span>
          </span>
          <h1 className="mt-5 font-display text-[48px] sm:text-[72px] lg:text-[92px] leading-[0.93] tracking-[-0.022em] text-ink-text">
            How a million apartments
            <br />
            <span className="italic text-brass-deep">became invisible.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-secondary">
            New York City&rsquo;s rent stabilization program is the largest source of affordable rental
            housing in the United States. It is also one of the most poorly understood — by the people
            it&rsquo;s meant to protect. Scroll on.
          </p>
          <div className="mt-10 flex items-center gap-2 text-[11px] text-muted">
            <span className="font-mono uppercase tracking-[0.18em]">Scroll</span>
            <span aria-hidden className="block h-px w-12 bg-rule-strong animate-pulse" />
          </div>
        </div>
      </section>

      {/* ── SECTION 1 — SCALE (sticky scrollytelling) ───────── */}
      <ScrollyScale steps={scaleSteps} />

      {/* ── PULL QUOTE 1 ────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 sm:px-8 lg:px-10">
        <PullQuote
          cite={
            <>
              Zapatka &amp; de Castro Galvao, <em className="not-italic text-secondary">Affordable Regulation: New York City Rent Stabilization as Housing Affordability Policy</em> (2023)
            </>
          }
        >
          By design, rent stabilization measures generally have wider coverage than other
          housing affordability policies or programs.
        </PullQuote>
      </section>

      {/* ── SECTION 2 — THE AWARENESS GAP ───────────────────── */}
      <section className="border-y border-rule bg-paper-soft py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 lg:px-10">
          <OneInFourCallout />
          <blockquote className="mt-10 mx-auto max-w-2xl text-center font-display italic text-[18px] sm:text-[20px] leading-snug tracking-[-0.005em] text-ink-text">
            &ldquo;Around a third of households cannot correctly report their rent stabilization
            status. Rent discounts are significantly larger for households correctly aware of
            their benefits, with a mean monthly discount of $645 vs $218 for those unaware.&rdquo;
          </blockquote>
          <div className="mt-4 mx-auto max-w-2xl text-center text-[11px] uppercase tracking-[0.18em] text-muted">
            Chen, Jiang &amp; Quintero
            <span className="normal-case tracking-normal italic text-secondary">
              {' '}— Measuring the Value of Rent Stabilization (2023)
            </span>
          </div>
        </div>
      </section>

      {/* ── PULL QUOTE 2 ────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 sm:px-8 lg:px-10">
        <PullQuote
          cite={
            <>
              Zapatka &amp; de Castro Galvao, <em className="not-italic text-secondary">Affordable Regulation: New York City Rent Stabilization as Housing Affordability Policy</em> (2023)
            </>
          }
        >
          Longer-tenured renters benefit more because they accumulate savings for longer.
        </PullQuote>
      </section>

      {/* ── SECTION 3 — OVERCHARGE MECHANICS (sticky chart) ── */}
      <ScrollyOvercharge steps={overSteps} />

      {/* ── SECTION 4 — STATUTE TIMELINE ────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10 mt-20 sm:mt-28">
        <span className="eyebrow flex items-center gap-2">
          <span className="h-px w-6 bg-brass" /> § IV · The Clock
        </span>
        <h2 className="mt-3 font-display text-[36px] sm:text-[48px] leading-[0.98] tracking-[-0.018em] text-ink-text">
          Six years to look back. Then it&rsquo;s gone.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-secondary">
          Before 2019, a tenant could only recover four years of overcharge. The Housing Stability
          and Tenant Protection Act of 2019 — HSTPA — extended the lookback to six and, for willful
          overcharges, opened the door to triple damages. But the clock still runs.
        </p>
        <div className="mt-8">
          <StatuteTimeline />
        </div>
      </section>

      {/* ── PULL QUOTE 3 ────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 sm:px-8 lg:px-10">
        <PullQuote
          cite={
            <>
              Chen, Jiang &amp; Quintero, <em className="not-italic text-secondary">Measuring the Value of Rent Stabilization and Understanding its Implications for Racial Inequality: Evidence from New York City</em> (2023)
            </>
          }
        >
          This illustrates the policy opacity, which may prevent lower educated and newcomers
          to the city to benefit from it, and provide room for landlords to control who they
          advertise the rent-stabilized status to.
        </PullQuote>
      </section>

      {/* ── SECTION 5 — WHY THIS TOOL EXISTS ────────────────── */}
      <section className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10 mt-20 sm:mt-28">
        <span className="eyebrow flex items-center gap-2">
          <span className="h-px w-6 bg-brass" /> § V · Why we built this
        </span>
        <h2 className="mt-3 font-display text-[36px] sm:text-[48px] leading-[0.98] tracking-[-0.018em] text-ink-text">
          A free, tenant-first lookup for the apartments NYC keeps quiet.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-secondary">
          <span className="font-display italic">amirentstabilized.nyc</span> answers two questions:{' '}
          <em>is my building rent-stabilized?</em> and{' '}
          <em>given my lease history, am I being overcharged?</em> If the answer to the second is
          yes, it drafts a complaint you can take to DHCR.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <StepCard
            n="01"
            title="Look up the building"
            body={
              <>
                We search NYC Planning Labs&rsquo; geocoder for your address, then check the
                normalized BBL against the NYCDB{' '}
                <code className="rounded bg-paper-soft border border-rule/60 px-1 py-0.5 text-[11px] font-mono text-ink-text">
                  rentstab_v2
                </code>{' '}
                dataset.
              </>
            }
          />
          <StepCard
            n="02"
            title="Walk the rent forward"
            body={
              <>
                If you enter a lease history, we apply Rent Guidelines Board orders #1–#{latestOrderNo()} to
                compute the legal renewal rent at every step and flag where the actual rent went
                higher.
              </>
            }
          />
          <StepCard
            n="03"
            title="Draft the complaint"
            body={
              <>
                We pre-fill DHCR Form RA-89 — Tenant&rsquo;s Complaint of Rent Overcharges —
                with your numbers, ready for a tenant attorney&rsquo;s review.
              </>
            }
          />
        </div>
      </section>

      {/* ── SECTION 6 — WHAT IT ISN'T ───────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10 mt-20 sm:mt-28">
        <span className="eyebrow flex items-center gap-2">
          <span className="h-px w-6 bg-brass" /> § VI · What it isn&rsquo;t
        </span>
        <h2 className="mt-3 font-display text-[36px] sm:text-[48px] leading-[0.98] tracking-[-0.018em] text-ink-text">
          The places this tool will quietly miss.
        </h2>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Caveat
            kicker="Not legal advice"
            body="A real overcharge case may involve MCI and IAI adjustments, vacancy allowances, fraud claims, and other facts this tool can't see."
          />
          <Caveat
            kicker="Not your DHCR rent history"
            body={
              <>
                The authoritative starting point for any case is your apartment&rsquo;s registered
                rent history, requested via{' '}
                <ExtA href="https://hcr.ny.gov/records-access">DHCR Form REC-1</ExtA>.
              </>
            }
          />
          <Caveat
            kicker="Not exhaustive"
            body="NYCDB coverage runs through roughly 2023; newly-stabilized or de-regulated buildings may show stale information. Cross-check on the DHCR Building Search."
          />
          <Caveat
            kicker="Not a law firm"
            body="This is not a law firm and use of this tool does not create an attorney-client relationship. Not affiliated with or endorsed by DHCR or any NY state agency."
          />
        </div>
      </section>

      {/* ── SECTION 7 — SOURCES ─────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10 mt-20 sm:mt-28">
        <span className="eyebrow flex items-center gap-2">
          <span className="h-px w-6 bg-brass" /> § VII · Sources & further reading
        </span>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-[14px] leading-relaxed text-secondary">
          <SourceLine
            href="https://journals.sagepub.com/doi/10.1177/15356841221123762"
            title="Affordable Regulation (Zapatka & de Castro Galvao, 2023)"
            note="City & Community study quantifying NYC stabilization's rent savings — the framing for the scale and tenure beats."
          />
          <SourceLine
            href="https://www.sciencedirect.com/science/article/abs/pii/S0166046223000832"
            title="Measuring the Value of Rent Stabilization (Chen, Jiang & Quintero, 2023)"
            note="Regional Science and Urban Economics study documenting tenant unawareness — source for the 1-in-4 figure."
          />
          <SourceLine
            href="https://www.nycdb.info/"
            title="NYCDB"
            note="Community-maintained scrape of NYC tax-bill PDFs that expose stabilized unit counts."
          />
          <SourceLine
            href="https://hcr.ny.gov/"
            title="DHCR"
            note="NY State Homes & Community Renewal — the authoritative rent registration record."
          />
          <SourceLine
            href="https://rentguidelinesboard.cityofnewyork.us/"
            title="Rent Guidelines Board"
            note={`Sets the annual legal renewal increases (Apartment Orders #1–#${latestOrderNo()}).`}
          />
          <SourceLine
            href="https://hcr.ny.gov/form-ra-89"
            title="DHCR Form RA-89"
            note="Tenant's Complaint of Rent Overcharges — the form this site drafts for you."
          />
          <SourceLine
            href="https://www.metcouncilonhousing.org/"
            title="Met Council on Housing"
            note="Free tenant counseling — call before you file."
          />
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 sm:px-8 lg:px-10 mt-24 mb-24">
        <div className="rounded-[14px] border border-rule bg-bone p-8 sm:p-10 text-center shadow-[0_18px_40px_-22px_rgba(20,14,6,0.25)]">
          <span className="eyebrow">Now you</span>
          <h3 className="mt-2 font-display text-[28px] sm:text-[36px] leading-tight tracking-[-0.012em] text-ink-text">
            Look up your building.
          </h3>
          <p className="mt-2 text-[14px] text-secondary max-w-md mx-auto">
            Free. No account. Takes about thirty seconds.
          </p>
          <Link
            href="/"
            className="btn-brass mt-6 inline-flex items-center gap-2 px-6 py-3 text-[15px]"
          >
            Search an address
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* ============================================================================
   Scrollytelling: SECTION 1 — Scale
   ============================================================================ */

function ScrollyScale({
  steps,
}: {
  steps: ReturnType<typeof useScrollSteps>;
}) {
  const { active, setRef } = steps;

  const beats = [
    {
      kicker: 'About 2,300,000',
      title: 'rental homes in New York City.',
      body: (
        <>
          Every dot is roughly 23,000 apartments — every walk-up, brownstone floor-through, prewar
          tower and post-war elevator building you&rsquo;ve ever passed.
        </>
      ),
    },
    {
      kicker: 'About 1,000,000',
      title: 'are rent-stabilized.',
      body: (
        <>
          Almost half. The orange tiles below — that&rsquo;s the mechanism keeping a million NYC
          households inside the city they grew up in.
        </>
      ),
    },
    {
      kicker: 'For comparison',
      title: 'public housing covers ~170k.',
      body: (
        <>
          NYCHA — the largest public housing authority in North America — covers a fraction of what
          stabilization does. It is the affordability program no one campaigns on.
        </>
      ),
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-20 sm:mt-28">
      <span className="eyebrow flex items-center gap-2">
        <span className="h-px w-6 bg-brass" /> § I · The shape of it
      </span>
      <h2 className="mt-3 font-display text-[36px] sm:text-[48px] leading-[0.98] tracking-[-0.018em] text-ink-text max-w-3xl">
        Almost half of New York&rsquo;s rentals are stabilized. Most renters can&rsquo;t name their
        building&rsquo;s status.
      </h2>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* sticky viz */}
        <div className="lg:col-span-7 lg:order-2">
          <div className="lg:sticky lg:top-24">
            {/* width is capped relative to viewport height so the square dot
                matrix stays fully visible while the panel is stuck */}
            <div className="rounded-[14px] border border-rule bg-bone p-5 sm:p-6 shadow-[0_18px_40px_-22px_rgba(20,14,6,0.22)] lg:mx-auto lg:max-w-[min(100%,calc(100vh-13rem))]">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">{beats[active].kicker}</span>
                <span className="font-mono text-[10px] text-muted">step {active + 1} / {beats.length}</span>
              </div>
              <h3 className="mt-2 font-display text-[24px] sm:text-[28px] leading-[1.05] tracking-[-0.012em] text-ink-text">
                {beats[active].title}
              </h3>
              <div className="mt-5">
                <DotMatrix activeStep={active} />
              </div>
            </div>
          </div>
        </div>

        {/* scroll text */}
        <div className="lg:col-span-5 lg:order-1 space-y-[60vh]">
          {beats.map((b, i) => (
            <div
              key={i}
              ref={setRef(i)}
              className={`transition-opacity duration-500 ${active === i ? 'opacity-100' : 'opacity-40'}`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass-deep">
                Beat 0{i + 1}
              </div>
              <p className="mt-3 font-display text-[24px] sm:text-[28px] leading-[1.18] tracking-[-0.012em] text-ink-text">
                <span className="text-brass-deep">{b.kicker}</span> {b.title}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-secondary max-w-md">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   Scrollytelling: SECTION 3 — Overcharge mechanics
   ============================================================================ */

function ScrollyOvercharge({
  steps,
}: {
  steps: ReturnType<typeof useScrollSteps>;
}) {
  const { active, setRef } = steps;

  const beats = [
    {
      kicker: 'Year 1',
      title: 'Your lease begins.',
      body: <>You sign at $2,000/month. Whether or not you know it, the apartment is stabilized.</>,
    },
    {
      kicker: 'Year 2',
      title: 'A renewal arrives.',
      body: (
        <>
          The Rent Guidelines Board has set a 1.5% renewal increase. The legal rent ticks up to
          $2,030. Your landlord&rsquo;s offer reads $2,150.
        </>
      ),
    },
    {
      kicker: 'Year 5',
      title: 'The gap compounds.',
      body: (
        <>
          Every year the legal rent grows by a board-set increase. Every year the actual rent grows
          faster. By year five the spread is roughly $400 per month.
        </>
      ),
    },
    {
      kicker: 'Year 10',
      title: 'The bill, made visible.',
      body: (
        <>
          Across a decade you have paid tens of thousands of dollars above the legal rent. None of
          it shows up on your lease. It shows up only when you compare two lines.
        </>
      ),
    },
    {
      kicker: 'But —',
      title: 'only six years are recoverable.',
      body: (
        <>
          The HSTPA statute of limitations caps your claim at the most recent six years. Anything
          older is real, but not recoverable. The shaded band shows what is still on the table.
        </>
      ),
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-24 sm:mt-32">
      <span className="eyebrow flex items-center gap-2">
        <span className="h-px w-6 bg-brass" /> § III · Two lines that disagree
      </span>
      <h2 className="mt-3 font-display text-[36px] sm:text-[48px] leading-[0.98] tracking-[-0.018em] text-ink-text max-w-3xl">
        Most overcharges aren&rsquo;t one bad lease. They&rsquo;re a slow drift.
      </h2>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* sticky chart */}
        <div className="lg:col-span-7 lg:order-2">
          <div className="lg:sticky lg:top-24">
            <div className="lg:mx-auto lg:max-w-[min(100%,calc((100vh-13rem)*1.45))]">
              <LineChart activeStep={active} />
              <div className="mt-3 text-[11px] text-muted leading-snug max-w-md">
                Illustrative — actual cases use the renewal date and RGB order in effect when each
                lease started, not a flat annual percentage.
              </div>
            </div>
          </div>
        </div>

        {/* scroll text */}
        <div className="lg:col-span-5 lg:order-1 space-y-[60vh]">
          {beats.map((b, i) => (
            <div
              key={i}
              ref={setRef(i)}
              className={`transition-opacity duration-500 ${active === i ? 'opacity-100' : 'opacity-40'}`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass-deep">
                {b.kicker}
              </div>
              <p className="mt-3 font-display text-[24px] sm:text-[30px] leading-[1.18] tracking-[-0.012em] text-ink-text">
                {b.title}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-secondary max-w-md">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   Small components
   ============================================================================ */

function StepCard({ n, title, body }: { n: string; title: string; body: ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  return (
    <div
      ref={ref}
      className={`rounded-[12px] border border-rule bg-bone p-5 transition-all duration-700 ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="font-mono text-[11px] font-semibold tracking-[0.18em] text-brass-deep">{n}</div>
      <div className="mt-2 font-display text-[19px] leading-snug text-ink-text">{title}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-secondary">{body}</p>
    </div>
  );
}

function Caveat({ kicker, body }: { kicker: string; body: ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  return (
    <div
      ref={ref}
      className={`rounded-[12px] border border-rust-bd bg-rust-bg/60 p-5 transition-all duration-700 ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rust text-bone text-[11px] font-bold">!</span>
        <div className="eyebrow text-rust">{kicker}</div>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-text">{body}</p>
    </div>
  );
}

function SourceLine({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <div className="border-t border-rule pt-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-display text-[16px] text-ink-text hover:text-brass-deep underline decoration-brass/30 underline-offset-2 hover:decoration-brass"
      >
        {title} <span aria-hidden className="text-[11px] text-muted">↗</span>
      </a>
      <div className="mt-1 text-[12px] text-muted leading-snug">{note}</div>
    </div>
  );
}

function ExtA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink-text underline decoration-brass/40 underline-offset-2 hover:text-brass-deep hover:decoration-brass"
    >
      {children}
    </a>
  );
}
