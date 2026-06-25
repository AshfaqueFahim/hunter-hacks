'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AddressSearch from '@/components/AddressSearch';
import DemoAddresses from '@/components/DemoAddresses';
import ResultCard from '@/components/ResultCard';
import RentHistoryForm from '@/components/RentHistoryForm';
import OverchargeSummary from '@/components/OverchargeSummary';
import ComplaintPreview from '@/components/ComplaintPreview';
import Footer from '@/components/Footer';
import StageStepper, { type Stage } from '@/components/StageStepper';
import type { GeoResult } from '@/lib/geosearch';
import type { Verdict } from '@/lib/stabilization';
import type { Estimate, LeaseEntry } from '@/lib/overcharge';

const CityMap3D = dynamic(() => import('@/components/CityMap3D'), { ssr: false });

type LookupResponse = Verdict & { lookupId?: number };
type MapStatus = 'idle' | 'flying' | 'arrived';

export default function Home() {
  const [selectedResult, setSelectedResult] = useState<GeoResult | null>(null);
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [mapStatus, setMapStatus] = useState<MapStatus>('idle');
  // Verdict is shown only after the cinematic flight lands. This keeps
  // the user from being yanked away from the animation by an auto-scroll.
  const [verdictRevealed, setVerdictRevealed] = useState(false);

  const verdictRef = useRef<HTMLDivElement>(null);
  const formRef    = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const draftRef   = useRef<HTMLDivElement>(null);
  const heroRef    = useRef<HTMLDivElement>(null);
  const fallbackRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleLookup = lookup && verdictRevealed ? lookup : null;

  const stage: Stage = useMemo(() => {
    if (estimate && visibleLookup?.status === 'likely_stabilized') return 'complaint';
    if (visibleLookup?.status === 'likely_stabilized' && !estimate) return 'estimate';
    if (visibleLookup) return 'verdict';
    return 'search';
  }, [visibleLookup, estimate]);

  const reachable = useMemo(() => {
    const set = new Set<Stage>(['search']);
    if (visibleLookup) set.add('verdict');
    if (visibleLookup?.status === 'likely_stabilized') set.add('estimate');
    if (estimate && visibleLookup?.status === 'likely_stabilized') set.add('complaint');
    return set;
  }, [visibleLookup, estimate]);

  // Reveal the verdict once the map has finished flying (or after a
  // safety timeout in case the map never reports 'arrived').
  useEffect(() => {
    if (!lookup) {
      setVerdictRevealed(false);
      if (fallbackRevealRef.current) {
        clearTimeout(fallbackRevealRef.current);
        fallbackRevealRef.current = null;
      }
      return;
    }
    if (mapStatus === 'arrived') {
      setVerdictRevealed(true);
    } else if (!fallbackRevealRef.current) {
      // Safety net: always reveal after 7s even if the map is misbehaving
      fallbackRevealRef.current = setTimeout(() => setVerdictRevealed(true), 7000);
    }
    return () => {
      if (fallbackRevealRef.current && mapStatus === 'arrived') {
        clearTimeout(fallbackRevealRef.current);
        fallbackRevealRef.current = null;
      }
    };
  }, [lookup, mapStatus]);

  // After the map arrives, *softly* nudge mobile viewers down to the
  // verdict. On desktop the map is sticky-left and the verdict appears
  // in the right column already in view — no scroll needed.
  useEffect(() => {
    if (!visibleLookup || !verdictRef.current) return;
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (!isMobile) return;
    const t = setTimeout(() => {
      verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
    return () => clearTimeout(t);
  }, [visibleLookup]);

  useEffect(() => {
    if (!estimate || !summaryRef.current) return;
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (!isMobile) return;
    const t = setTimeout(() => {
      summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => clearTimeout(t);
  }, [estimate]);

  async function handleSelect(result: GeoResult) {
    setSelectedResult(result);
    setLookup(null);
    setLookupError(null);
    setEstimate(null);
    setEstimateError(null);
    setIsLooking(true);

    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbl: result.bbl, address: result.label }),
      });
      if (!res.ok) {
        const errorBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorBody.error ?? `Request failed with status ${res.status}`);
      }
      const data = (await res.json()) as LookupResponse;
      setLookup(data);
    } catch (err) {
      console.error('Lookup failed:', err);
      setLookupError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLooking(false);
    }
  }

  async function handleEstimate(input: { history: LeaseEntry[] }) {
    if (!lookup) return;
    setEstimate(null);
    setEstimateError(null);
    setIsEstimating(true);
    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: input.history, bbl: lookup.bbl, lookupId: lookup.lookupId }),
      });
      if (!res.ok) {
        const errorBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorBody.error ?? `Request failed with status ${res.status}`);
      }
      const data = (await res.json()) as Estimate;
      setEstimate(data);
    } catch (err) {
      console.error('Estimate failed:', err);
      setEstimateError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsEstimating(false);
    }
  }

  function handleReset() {
    setSelectedResult(null);
    setLookup(null);
    setEstimate(null);
    setLookupError(null);
    setEstimateError(null);
    setVerdictRevealed(false);
    setMapStatus('idle');
    heroRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function handleStageJump(s: Stage) {
    if (s === 'search') heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (s === 'verdict') verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (s === 'estimate') formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (s === 'complaint') draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const showForm = visibleLookup?.status === 'likely_stabilized';
  const target = selectedResult
    ? {
        lat: selectedResult.lat,
        lng: selectedResult.lng,
        address: selectedResult.label,
        bbl: selectedResult.bbl,
        bin: selectedResult.bin,
      }
    : null;
  const flightInProgress = !!selectedResult && mapStatus !== 'arrived' && !verdictRevealed;

  return (
    <div className="min-h-screen bg-paper">
      {/* ── Top bar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-paper/85 border-b border-rule/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleReset}
            className="group flex items-baseline -ml-0.5 pr-1"
            aria-label="Home"
          >
            <span className="font-display italic text-[18px] sm:text-[22px] font-medium tracking-tight text-ink-text group-hover:text-brass-deep transition-colors whitespace-nowrap pr-0.5">
              Am I Rent Stabilized?
            </span>
          </button>

          <nav className="flex items-center gap-1">
            <Link
              href="/info"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-secondary hover:bg-paper-soft hover:text-ink-text transition-colors"
            >
              Info
            </Link>
            {(visibleLookup || estimate || selectedResult) && (
              <button
                type="button"
                onClick={handleReset}
                className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-rule-strong/70 bg-bone px-3.5 py-1.5 text-xs font-semibold text-secondary hover:border-brass hover:bg-brass-wash hover:text-brass-deep transition-all"
                title="Start over with a new address"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 6a4 4 0 1 1 1.2 2.85" strokeLinecap="round" />
                  <path d="M2 3v3h3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Reset
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero: split — 3D map (left) + content (right) ─────── */}
      <section ref={heroRef} className="relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* MAP */}
            <div className="lg:col-span-7 order-1 lg:order-1">
              <div className="relative h-[52vh] min-h-[360px] lg:h-[68vh] lg:min-h-[440px] lg:sticky lg:top-20 rounded-[16px] overflow-hidden border border-ink-line bg-ink shadow-[0_30px_60px_-30px_rgba(12,15,23,0.55)] animate-scale-in">
                <CityMap3D target={target} onStatusChange={setMapStatus} />

                {/* Top-left: BBL/coords readout */}
                <div className="pointer-events-none absolute top-3 left-3 ink-card px-3 py-2 max-w-[70%]">
                  <div className="eyebrow text-brass-glow/80">
                    {!target ? 'New York City' : mapStatus === 'flying' ? 'Approaching' : 'Building located'}
                  </div>
                  {target ? (
                    <div className="mt-0.5 font-display text-sm leading-tight truncate" title={target.address}>
                      {target.address.split(',')[0]}
                    </div>
                  ) : (
                    <div className="mt-0.5 font-display text-sm">5 boroughs · ~1M stabilized units</div>
                  )}
                  <div className="mt-1 font-mono text-[10px] opacity-70">
                    {target
                      ? `${target.lat.toFixed(4)}°N  ${Math.abs(target.lng).toFixed(4)}°W  ·  BBL ${target.bbl}`
                      : 'Globe view · idle'}
                  </div>
                </div>

                {/* Bottom-left: status indicator */}
                <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
                  <span className="ink-card flex items-center gap-2 px-3 py-1.5 text-[11px]">
                    <span className="relative flex h-2 w-2">
                      {mapStatus === 'flying' && (
                        <span className="absolute inset-0 rounded-full bg-brass animate-ping opacity-75" />
                      )}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        mapStatus === 'arrived' ? 'bg-verdigris-bd' : mapStatus === 'flying' ? 'bg-brass' : 'bg-rule-strong/60'
                      }`} />
                    </span>
                    <span className="font-mono uppercase tracking-wider opacity-90">
                      {mapStatus === 'flying' ? 'flying' : mapStatus === 'arrived' ? 'arrived' : 'standby'}
                    </span>
                  </span>
                  {mapStatus === 'arrived' && visibleLookup && (
                    <button
                      type="button"
                      onClick={() => verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="lg:hidden ink-card pointer-events-auto px-3 py-1.5 text-[11px] font-medium text-brass-glow border-brass/40 hover:bg-brass/15 transition-colors"
                    >
                      View verdict ↓
                    </button>
                  )}
                </div>

                {/* Initial overlay legend (only when nothing selected) */}
                {!target && (
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 sm:right-3 sm:left-auto sm:bottom-3 sm:max-w-[300px] ink-card p-4 animate-fade-in">
                    <div className="eyebrow text-brass-glow/80">How this works</div>
                    <ol className="mt-2 space-y-1.5 text-[12px] leading-snug">
                      <li className="flex gap-2"><span className="text-brass-glow font-mono">01</span><span>Search any NYC address — we’ll fly there.</span></li>
                      <li className="flex gap-2"><span className="text-brass-glow font-mono">02</span><span>The building is checked against DHCR + NYCDB.</span></li>
                      <li className="flex gap-2"><span className="text-brass-glow font-mono">03</span><span>Add your lease history to estimate overcharge.</span></li>
                      <li className="flex gap-2"><span className="text-brass-glow font-mono">04</span><span>Draft a DHCR Form RA-89 complaint in plain English.</span></li>
                    </ol>
                  </div>
                )}

                {/* Cinematic vignette */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(12,15,23,0.55)_100%)]" />
              </div>
            </div>

            {/* CONTENT */}
            <div className="lg:col-span-5 order-2 lg:order-2 space-y-6">
              {/* Hero copy */}
              <div className="relative pt-2">
                <span className="eyebrow flex items-center gap-2">
                  <span className="h-px w-6 bg-brass" />
                  Vol. I · Issue 01
                  <span className="h-px flex-1 bg-rule" />
                  <span className="font-mono text-[10px] text-muted normal-case tracking-normal">
                    {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </span>
                <h1 className="mt-3 font-display text-[44px] sm:text-[52px] lg:text-[60px] leading-[0.94] tracking-[-0.018em] text-ink-text">
                  <span className="float-left mr-3 mt-1 text-brass-deep font-display font-bold leading-[0.78] text-[88px] sm:text-[104px] lg:text-[120px]">
                    A
                  </span>
                  n aerial view of <span className="italic text-brass-deep">every</span> rent-stabilized apartment in New York.
                </h1>
                <p className="mt-4 clear-left text-[15px] leading-relaxed text-secondary max-w-lg">
                  Search an address. We fly the camera in, check the building against DHCR and NYCDB,
                  and — if it’s stabilized — turn your lease history into a draftable overcharge complaint.
                </p>
              </div>

              {/* Search */}
              <div>
                <AddressSearch onSelect={handleSelect} disabled={isLooking} variant="hero" />
                <DemoAddresses onSelect={handleSelect} disabled={isLooking} />
              </div>

              {/* Stage stepper */}
              <div className="paper px-5 py-4">
                <StageStepper current={stage} reachable={reachable} onJump={handleStageJump} />
              </div>

              {/* Hero stats */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <Stat n="~1M" l="Stabilized units" />
                <Stat n="6 yr" l="HSTPA window" />
                <Stat n="57" l="RGB orders modeled" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workspace: cards stack below as flow advances ────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 space-y-6">
        {(isLooking || flightInProgress) && (
          <div className="paper px-6 py-6 animate-fade-in-up">
            <span className="eyebrow">
              {mapStatus === 'flying' ? 'Approaching' : 'Locating'}
            </span>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-5 w-5 rounded-full border-2 border-brass border-t-transparent animate-spin" />
              <p className="font-display text-lg text-ink-text">
                {mapStatus === 'flying'
                  ? 'Flying the camera in — verdict will appear when we land.'
                  : 'Cross-checking the BBL against the DHCR + NYCDB record…'}
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-3/5 rounded shimmer bg-paper-soft" />
              <div className="h-3 w-2/5 rounded shimmer bg-paper-soft" />
            </div>
          </div>
        )}

        {lookupError && (
          <div className="rounded-[12px] border border-rust-bd bg-rust-bg px-5 py-4 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rust text-bone text-xs font-bold">!</span>
              <div>
                <p className="text-sm font-semibold text-rust">Lookup failed</p>
                <p className="mt-0.5 text-xs text-rust/80">{lookupError}</p>
              </div>
            </div>
          </div>
        )}

        {visibleLookup && selectedResult && (
          <div ref={verdictRef}>
            <ResultCard verdict={visibleLookup} address={selectedResult.label} />
          </div>
        )}

        {showForm && (
          <div ref={formRef}>
            <RentHistoryForm isSubmitting={isEstimating} onSubmit={handleEstimate} />
          </div>
        )}

        {isEstimating && (
          <div className="paper px-6 py-6 animate-fade-in-up">
            <span className="eyebrow">Calculating</span>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-5 w-5 rounded-full border-2 border-brass border-t-transparent animate-spin" />
              <p className="font-display text-lg text-ink-text">Walking your lease history forward through every RGB order…</p>
            </div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="h-20 rounded-[10px] shimmer bg-paper-soft" />
              <div className="h-20 rounded-[10px] shimmer bg-paper-soft" />
              <div className="h-20 rounded-[10px] shimmer bg-paper-soft" />
            </div>
          </div>
        )}

        {estimateError && (
          <div className="rounded-[12px] border border-rust-bd bg-rust-bg px-5 py-4 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rust text-bone text-xs font-bold">!</span>
              <div>
                <p className="text-sm font-semibold text-rust">Estimate failed</p>
                <p className="mt-0.5 text-xs text-rust/80">{estimateError}</p>
              </div>
            </div>
          </div>
        )}

        {estimate && (
          <div ref={summaryRef}>
            <OverchargeSummary estimate={estimate} />
          </div>
        )}

        {estimate && visibleLookup?.status === 'likely_stabilized' && selectedResult && (
          <div ref={draftRef}>
            <ComplaintPreview
              verdict={visibleLookup}
              estimate={estimate}
              address={selectedResult.label}
              bin={selectedResult.bin}
            />
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="paper-deep p-3">
      <div className="font-display text-2xl tabular text-ink-text leading-none">{n}</div>
      <div className="mt-1 eyebrow">{l}</div>
    </div>
  );
}
