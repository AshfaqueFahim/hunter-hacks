'use client';

// ──────────────────────────────────────────────────────────────────────
// ComplaintPreview — Step 4 of the app, "Section IV · Filing packet".
//
// This is the component that owns the "Generate my filing packet" button
// and everything downstream of it. Rendered by src/app/page.tsx once a
// lookup has come back `likely_stabilized` AND an overcharge estimate
// exists (see the `stage === 'complaint'` branch in page.tsx).
//
// What this component actually produces, end to end:
//   1. A tenant-facing FORM (state `form` below) collecting the details
//      the AI drafter and the RA-89 PDF filler both need (name, owner,
//      tone, which RA-89 §13 causes apply, etc).
//   2. An AI-DRAFTED THREE-BLOCK TEXT — fetched by streaming POST to
//      /api/complaint — containing (A) a field cheat-sheet, (B) the
//      free-form §14 narrative, (C) a filing checklist. See `text` state.
//   3. A "COMPANION DOC" PDF — a nicely typeset rendering of that same
//      three-block text, built client-side by src/lib/pdf-export.ts and
//      shown inline via the `pdfUrl` <iframe>.
//   4. An OFFICIAL RA-89 PDF — the actual fillable government form,
//      auto-filled field-by-field by src/lib/ra89-fill.ts (it reuses the
//      §14 narrative pulled out of the AI text with a regex, see
//      handleRa89Download below).
//
// Everything here is keyed to one BBL and persisted to localStorage so a
// tenant can leave and come back without re-typing their info.
// ──────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Verdict } from '@/lib/stabilization';
import type { Estimate } from '@/lib/overcharge';
import { getOrder } from '@/lib/rgb';
import type {
  ComplaintInput,
  OverchargeCause,
  Section8Program,
  TenantType,
  Tone,
} from '@/lib/complaint';
import { downloadPdf, renderPdfBlobUrl } from '@/lib/pdf-export';

type Props = {
  verdict: Verdict;
  estimate: Estimate;
  address: string;
  bin?: string;
};

// Lifecycle of the AI draft: idle (nothing requested yet) → streaming
// (tokens arriving from /api/complaint) → done (full text in hand, PDF
// preview renders) → error (request/stream failed, see `error` state).
type Phase = 'idle' | 'streaming' | 'done' | 'error';
// Mirrors LLMProvider['name'] in src/lib/providers/types.ts — whichever
// backend actually served the draft, surfaced in the UI as "via openai".
type Provider = 'openai' | 'anthropic';
// Drives the "Owner / managing agent" auto-fill block. Hitting
// /api/owner-lookup with the building's BIN looks up the registered HPD
// owner/agent so the tenant doesn't have to dig it out of a lease.
type OwnerLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; owner?: string; address?: string; agent?: string; agentAddress?: string }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

// Everything the tenant can type or toggle in this component. Persisted
// to localStorage per-BBL (see storageKey below) and is the source for
// both buildPayload() (→ AI drafter) and handleRa89Download() (→ PDF form).
type FormState = {
  tenantName: string;
  unit: string;
  mailingSameAsBuilding: boolean;
  mailingAddress: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  phoneHome: string;
  phoneDay: string;
  tenantType: TenantType;
  scrieDrie: boolean;
  section8: Section8Program;
  coop: boolean;
  electricityIncluded: boolean | null;
  ownerName: string;
  ownerAddress: string;
  ownerPhone: string;
  causes: OverchargeCause[];
  raisedInCourt: boolean;
  courtIndexNo: string;
  tone: Tone;
  // "Touched" flags for the required section below. tenantType/scrieDrie/
  // section8 all default to a legitimate real answer ('prime'/false/
  // 'none'), so the value alone can't distinguish "the tenant
  // deliberately chose this" from "untouched default" — these flags
  // exist purely so the Generate button can require an explicit answer
  // instead of silently accepting the default. (electricityIncluded
  // doesn't need one: its default is `null`, which already means
  // "unanswered"; causes has a real empty state too.) Persisted to
  // localStorage along with the rest of FormState, so a tenant who
  // already confirmed these isn't asked again.
  tenantTypeTouched: boolean;
  scrieDrieTouched: boolean;
  section8Touched: boolean;
};

const EMPTY_FORM: FormState = {
  tenantName: '',
  unit: '',
  mailingSameAsBuilding: true,
  mailingAddress: '',
  mailingCity: '',
  mailingState: '',
  mailingZip: '',
  phoneHome: '',
  phoneDay: '',
  tenantType: 'prime',
  scrieDrie: false,
  section8: 'none',
  coop: false,
  electricityIncluded: null,
  ownerName: '',
  ownerAddress: '',
  ownerPhone: '',
  causes: ['other'],
  raisedInCourt: false,
  courtIndexNo: '',
  tone: 'neutral',
  tenantTypeTouched: false,
  scrieDrieTouched: false,
  section8Touched: false,
};

// Checkbox options for RA-89 §13 ("why are you filing"). The `id`s here
// are the OverchargeCause union from src/lib/complaint.ts and flow
// straight through to both the AI prompt and the RA-89 checkbox mapping
// in src/lib/ra89-fill.ts (search for `Check Box25`..`Check Box31`).
const CAUSE_OPTIONS: { id: OverchargeCause; label: string }[] = [
  { id: 'other', label: 'Other (rent increase above the RGB legal ceiling. Select if there was an overcharge calculated.)' },
  { id: 'mci', label: 'MCI increase (There was a rent hike because your whole building was improved)' },
  { id: 'iai', label: 'IAI increase (There was a rent hike because your specific apartment was improved)' },
  { id: 'fmra', label: 'FMRA (Landlord increased rent before registration)' },
  { id: 'rent_reduction_order', label: 'Rent Reduction Order outstanding (landlord did not lower rent after DHCR order)' },
  { id: 'missing_registrations', label: 'Missing registrations (landlord failed to register the rent)' },
  { id: 'parking', label: 'Parking charges (illegal or excessive parking fees)' },
  { id: 'illegal_fees', label: 'Illegal fees / surcharges (unauthorized extra charges)' },
  { id: 'security_deposit', label: 'Security deposit > 1 month (landlord charged more than one month’s deposit)' },
];

const inputClass =
  'w-full rounded-[10px] border border-rule bg-bone px-3 py-2.5 text-sm text-ink-text shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] placeholder:text-muted/70 focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/25 disabled:bg-paper-soft';

// One saved draft-form per building — so switching addresses never bleeds
// one tenant's info into another building's packet.
const storageKey = (bbl: string) => `ledger:complaint:${bbl}`;

export default function ComplaintPreview({ verdict, estimate, address, bin }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showRaw, setShowRaw] = useState(false);
  const [ownerLookup, setOwnerLookup] = useState<OwnerLookupState>({ status: 'idle' });
  const [hydratedFromStorage, setHydratedFromStorage] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [text, setText] = useState('');
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [ra89Filling, setRa89Filling] = useState(false);
  const [ra89Error, setRa89Error] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── localStorage hydration ──────────────────────────────────────────
  // On mount (or when the BBL changes because the user picked a new
  // address), pull any previously-saved form for THIS building back in.
  // `hydratedFromStorage` gates the owner-lookup effect and the
  // save-back effect below so they don't fire before this read completes
  // (otherwise we'd immediately overwrite the saved draft with blanks).
  useEffect(() => {
    if (!verdict.bbl) return;
    try {
      const raw = window.localStorage.getItem(storageKey(verdict.bbl));
      if (raw) {
        const saved = JSON.parse(raw) as Partial<FormState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      /* ignore corrupt storage */
    } finally {
      setHydratedFromStorage(true);
    }
  }, [verdict.bbl]);

  // Mirror image of the hydration effect: every time the form changes,
  // write it straight back to localStorage so the draft survives a
  // refresh or a trip to a different stage of the app.
  useEffect(() => {
    if (!hydratedFromStorage || !verdict.bbl) return;
    try {
      window.localStorage.setItem(storageKey(verdict.bbl), JSON.stringify(form));
    } catch {
      /* quota / disabled */
    }
  }, [form, verdict.bbl, hydratedFromStorage]);

  // ─── HPD owner auto-lookup ───────────────────────────────────────────
  // Fires once per building (keyed on `bin`), but only if the tenant
  // hasn't already typed (or restored from storage) an owner name/address
  // — we never want to clobber a manual entry. Hits GET /api/owner-lookup,
  // which wraps src/lib/hpd.ts's NYC Open Data HPD registration lookup.
  useEffect(() => {
    if (!bin) return;
    if (form.ownerName.trim().length > 0 || form.ownerAddress.trim().length > 0) return;
    if (!hydratedFromStorage) return;

    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOwnerLookup({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/owner-lookup?bin=${encodeURIComponent(bin)}`, { signal: ctrl.signal });
        if (!res.ok) {
          setOwnerLookup({ status: 'error', message: 'Lookup failed' });
          return;
        }
        const data = (await res.json()) as {
          found: boolean;
          owner?: { name: string; address: string } | null;
          agent?: { name: string; address: string } | null;
        };
        if (!data.found || (!data.owner && !data.agent)) {
          setOwnerLookup({ status: 'not_found' });
          return;
        }
        const ownerName = data.owner?.name ?? data.agent?.name ?? '';
        const ownerAddress = data.owner?.address ?? data.agent?.address ?? '';
        setOwnerLookup({
          status: 'found',
          owner: data.owner?.name,
          address: data.owner?.address,
          agent: data.agent?.name,
          agentAddress: data.agent?.address,
        });
        setForm((prev) =>
          prev.ownerName.trim() || prev.ownerAddress.trim()
            ? prev
            : { ...prev, ownerName, ownerAddress },
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setOwnerLookup({ status: 'error', message: 'Network error' });
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bin, hydratedFromStorage]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (textareaRef.current && phase === 'streaming') {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [text, phase]);

  // ─── Render & cache the PDF blob URL when the draft is complete ──────
  // This is the only network-y bit on the post-draft path: we render a
  // jsPDF document client-side, blob it, and feed the URL to an <iframe>
  // for inline preview. Re-renders when the user edits raw text.
  useEffect(() => {
    if (phase !== 'done' || !text) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPdfUrl(null);
      }
      return;
    }
    const url = renderPdfBlobUrl(text, {
      address,
      bbl: verdict.bbl,
      tenantName: form.tenantName.trim() || '[YOUR NAME]',
      unit: form.unit.trim() || '',
      generatedAt: generatedAt ?? new Date(),
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, text, address, verdict.bbl, form.tenantName, form.unit]);

  // ─── form helpers ────────────────────────────────────────────────────
  // Generic setter used by every <Input>/<Select>/<Toggle> below.
  const updateForm = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  // Checkbox-list toggle for the RA-89 §13 "causes" — adds/removes one
  // cause id from the array rather than replacing the whole list.
  const toggleCause = (id: OverchargeCause) => {
    setForm((prev) => {
      const has = prev.causes.includes(id);
      return { ...prev, causes: has ? prev.causes.filter((c) => c !== id) : [...prev.causes, id] };
    });
  };

  // Converts the raw `form` state into the shape /api/complaint expects
  // (ComplaintInput, minus the verdict/estimate/address the caller already
  // has). Empty strings are normalized to `undefined` so the server's
  // buildFieldMap() (src/lib/complaint.ts) can apply its own placeholder
  // defaults instead of drafting around an empty string.
  const buildPayload = useCallback((): Omit<ComplaintInput, 'verdict' | 'estimate' | 'address'> => ({
    tenantName: form.tenantName.trim() || undefined,
    unit: form.unit.trim() || undefined,
    mailingAddress: form.mailingSameAsBuilding ? undefined : form.mailingAddress.trim() || undefined,
    mailingCity: form.mailingSameAsBuilding ? undefined : form.mailingCity.trim() || undefined,
    mailingState: form.mailingSameAsBuilding ? undefined : form.mailingState.trim() || undefined,
    mailingZip: form.mailingSameAsBuilding ? undefined : form.mailingZip.trim() || undefined,
    tenantPhoneHome: form.phoneHome.trim() || undefined,
    tenantPhoneDay: form.phoneDay.trim() || undefined,
    tenantType: form.tenantType,
    scrieDrie: form.scrieDrie || undefined,
    section8: form.section8 !== 'none' ? form.section8 : undefined,
    coop: form.coop || undefined,
    electricityIncluded: form.electricityIncluded ?? undefined,
    ownerName: form.ownerName.trim() || undefined,
    ownerAddress: form.ownerAddress.trim() || undefined,
    ownerPhone: form.ownerPhone.trim() || undefined,
    causes: form.causes.length > 0 ? form.causes : undefined,
    raisedInCourt: form.raisedInCourt || undefined,
    courtIndexNo: form.raisedInCourt ? form.courtIndexNo.trim() || undefined : undefined,
    tone: form.tone,
  }), [form]);

  // Drives the "Still missing: …" hint shown above the Generate button —
  // purely informational, does NOT block drafting (the AI just leaves
  // bracketed placeholders like "[ASK TENANT]" for whatever's absent).
  const missing = useMemo(() => {
    const out: string[] = [];
    if (!form.tenantName.trim()) out.push('your name');
    if (!form.phoneDay.trim() && !form.phoneHome.trim()) out.push('a phone number');
    if (!form.ownerName.trim() || !form.ownerAddress.trim()) out.push('owner info');
    return out;
  }, [form]);

  // Unlike `missing` above (informational only — drafting proceeds with
  // blanks), every item here actually BLOCKS the Generate button: the
  // "Required details" card (tenant type, SCRIE/DRIE, Section 8,
  // electricity) plus the §13 causes checklist. "Raised in court" is
  // deliberately NOT in this list — that one stays optional, default
  // "No" is an acceptable answer on its own.
  //
  // tenantType/scrieDrie/section8 all default to a legitimate real
  // answer ('prime'/false/'none'), so completion is tracked via the
  // *Touched flags on FormState rather than the value itself (see the
  // comment on those flags' declaration above). electricityIncluded
  // doesn't need a touched flag: its default is `null`, which already
  // means "unanswered". causes has a real empty state (the tenant
  // unchecked everything), so a length check is enough there.
  const requiredMissing = useMemo(() => {
    const out: string[] = [];
    if (!form.tenantTypeTouched) out.push('tenant type');
    if (!form.scrieDrieTouched) out.push('SCRIE/DRIE status');
    if (!form.section8Touched) out.push('Section 8 status');
    if (form.electricityIncluded === null) out.push('electricity in rent');
    if (form.causes.length === 0) out.push('at least one cause (§13)');
    return out;
  }, [form]);

  // ─── stream call ─────────────────────────────────────────────────────
  // THIS is what the "Generate my filing packet" button calls.
  //
  // Flow: POST the verdict + overcharge estimate + everything the tenant
  // typed to /api/complaint (src/app/api/complaint/route.ts), which
  // validates it, forwards it to whichever LLM provider is configured
  // (src/lib/complaint.ts → src/lib/providers/*), and streams the answer
  // back as newline-delimited JSON (NDJSON) — one line per event, NOT a
  // single JSON blob, so the UI can render tokens as they arrive instead
  // of waiting for the whole ~30s draft to finish.
  //
  // Event shapes (mirror the comment atop the route handler):
  //   { type: 'provider', data: 'openai' | 'anthropic' }  — sent once, first
  //   { type: 'text', data: '<delta>' }                   — repeated, appended to `text`
  //   { type: 'error', data: '<message>' }                — stream failed mid-way
  //   { type: 'done' }                                     — (route sends this; loop just exits on stream close)
  async function handleDraft() {
    // Belt-and-suspenders: the Generate/Redraft button is already
    // disabled while requiredMissing is non-empty, but guard here too in
    // case this is ever wired to something else (e.g. a keyboard submit).
    if (requiredMissing.length > 0) return;
    // Re-entrant: clicking Generate/Redraft while a previous stream is
    // still running aborts the old one first.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('streaming');
    setText('');
    setProvider(null);
    setError(null);
    setCopied(false);
    setShowRaw(false);

    try {
      const res = await fetch('/api/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, estimate, address, ...buildPayload() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const errorBody = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
        const detail = errorBody.details ? ` — ${JSON.stringify(errorBody.details)}` : '';
        throw new Error((errorBody.error ?? `Request failed with status ${res.status}`) + detail);
      }
      // Manual NDJSON parser: read raw bytes off the response body,
      // decode to text, and split on '\n' — fetch's streaming body API
      // gives us chunks of bytes that don't necessarily land on line
      // boundaries, so we buffer partial lines across reads.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let event: { type: string; data?: unknown };
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'provider') setProvider(event.data as Provider);
          else if (event.type === 'text' && typeof event.data === 'string') setText((p) => p + (event.data as string));
          else if (event.type === 'error') throw new Error(typeof event.data === 'string' ? event.data : 'Streaming error');
        }
      }
      setPhase('done');
      setGeneratedAt(new Date());
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setPhase(text.length > 0 ? 'done' : 'idle');
        if (text.length > 0) setGeneratedAt(new Date());
        return;
      }
      console.error('Complaint draft failed:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong drafting the complaint.');
      setPhase('error');
    }
  }

  // Cancels an in-flight draft. If text has already streamed in, we keep
  // it and flip to 'done' rather than discarding a partial draft (see
  // the AbortError branch in handleDraft's catch).
  function handleStop() { abortRef.current?.abort(); }

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error('Copy failed:', err); }
  }

  // "Companion doc" download — re-renders the same three-block AI text
  // shown in the <iframe> preview into a standalone PDF file (vs. just
  // grabbing the already-rendered blob) via src/lib/pdf-export.ts.
  function handleDownload() {
    if (!text) return;
    downloadPdf(text, {
      address, bbl: verdict.bbl,
      tenantName: form.tenantName.trim() || '[YOUR NAME]',
      unit: form.unit.trim() || '',
      generatedAt: generatedAt ?? new Date(),
    });
  }

  // Shared subject/body for both email exit-paths below. Note this does
  // NOT attach the PDF — mail-client links can't carry attachments, so
  // the body explicitly tells the tenant to attach the file they just
  // downloaded.
  function buildEmail(): { subject: string; body: string } {
    const subject = `RA-89 Filing Packet — ${address.split(',')[0]}`;
    const body = [
      'Hi,',
      '',
      `Attached is my draft RA-89 filing packet for ${address}.`,
      `BBL: ${verdict.bbl}`,
      '',
      'The PDF was generated by amirentstabilized.nyc and is a starting point — please review every line before filing.',
      '',
      '— ' + (form.tenantName.trim() || 'A tenant'),
    ].join('\n');
    return { subject, body };
  }

  function handleGmail() {
    const { subject, body } = buildEmail();
    const url = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  function handleMailto() {
    const { subject, body } = buildEmail();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // ─── Fill the OFFICIAL government PDF ────────────────────────────────
  // The "Download RA-89 (filled)" button. Distinct from handleDownload()
  // above: that one re-typesets the AI's free-form text into a companion
  // PDF; THIS one takes the real, fillable RA-89 AcroForm (a static file
  // under /public, loaded inside ra89-fill.ts) and programmatically fills
  // its named text/checkbox fields with structured form data — the AI
  // text is only consulted for one thing: the §14 narrative paragraph.
  async function handleRa89Download() {
    if (!text) return;
    setRa89Filling(true);
    setRa89Error(null);
    try {
      // Dynamically imported (rather than a top-level import) because
      // pdf-lib + the template fetch are only ever needed once the draft
      // is done — keeps it out of the initial bundle.
      const { fillRa89Form, downloadRa89 } = await import('@/lib/ra89-fill');

      // Extract block B (§14 narrative) from the AI draft. The draft's
      // three blocks are delimited by "═══ A. ... ═══" rules (see
      // COMPLAINT_SYSTEM_PROMPT in complaint-template.ts); this regex
      // grabs everything between the "B." rule and the next rule (or EOF).
      const narrativeMatch = text.match(/═{3,}[^═]*B\.[^═]*═{3,}([\s\S]*?)(?:═{3,}|$)/);
      const narrative = narrativeMatch ? narrativeMatch[1].trim() : '';

      const bytes = await fillRa89Form({
        tenantName: form.tenantName.trim() || undefined,
        unit: form.unit.trim() || undefined,
        mailingAddress: form.mailingSameAsBuilding ? undefined : form.mailingAddress.trim() || undefined,
        mailingCity: form.mailingSameAsBuilding ? undefined : form.mailingCity.trim() || undefined,
        mailingState: form.mailingSameAsBuilding ? undefined : form.mailingState.trim() || undefined,
        mailingZip: form.mailingSameAsBuilding ? undefined : form.mailingZip.trim() || undefined,
        address,
        phoneHome: form.phoneHome.trim() || undefined,
        phoneDay: form.phoneDay.trim() || undefined,
        tenantType: form.tenantType,
        scrieDrie: form.scrieDrie,
        section8: form.section8 !== 'none' ? form.section8 : undefined,
        coop: form.coop,
        electricityIncluded: form.electricityIncluded,
        ownerName: form.ownerName.trim() || undefined,
        ownerAddress: form.ownerAddress.trim() || undefined,
        ownerPhone: form.ownerPhone.trim() || undefined,
        causes: form.causes,
        raisedInCourt: form.raisedInCourt,
        courtIndexNo: form.courtIndexNo.trim() || undefined,
        estimate,
        narrative,
      });
      downloadRa89(bytes, verdict.bbl);
    } catch (err) {
      setRa89Error(err instanceof Error ? err.message : 'Failed to generate RA-89');
    } finally {
      setRa89Filling(false);
    }
  }

  function handlePrint() {
    if (!pdfUrl) return;
    const w = window.open(pdfUrl, '_blank');
    setTimeout(() => w?.print(), 600);
  }

  const isStreaming = phase === 'streaming';
  const isDone = phase === 'done';

  const mostRecentLease = estimate.years_analyzed[estimate.years_analyzed.length - 1];
  let showFutureLeaseWarning = false;
  if (mostRecentLease && getOrder(mostRecentLease.lease_start) === null) {
    showFutureLeaseWarning = true;
  }

  // ─── render ──────────────────────────────────────────────────────────
  return (
    <section className="paper relative overflow-hidden animate-fade-in-up">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-brass" />
      <div className="px-6 sm:px-8 pt-6 pb-7">
        <span className="eyebrow">Section IV · Filing packet</span>
        <h2 className="mt-1.5 font-display text-[28px] sm:text-[32px] leading-[1.05] tracking-tight text-ink-text">
          {isDone ? 'Your packet is ready.' : 'Build your filing packet.'}
        </h2>
        <p className="mt-2 text-sm text-secondary max-w-xl">
          {isDone
            ? 'A multi-page PDF you attach to the official RA-89 form. Preview, download, or send below.'
            : (
                <>A polished PDF you attach to{' '}
                  <a href="https://hcr.ny.gov/form-ra-89" target="_blank" rel="noopener noreferrer" className="underline decoration-brass/40 underline-offset-2 hover:text-brass-deep">
                    DHCR Form RA-89
                  </a>.
                </>
              )}
        </p>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* PRE-DRAFT (and during streaming, above the streaming view)      */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {!isDone && (
          <>
            {showFutureLeaseWarning && (
              <div className="mt-6 rounded-[14px] border border-rust/30 bg-rust-wash/10 px-5 py-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="eyebrow text-rust">Important</span>
                  <span className="h-px flex-1 bg-rust/30" />
                </div>
                <p className="text-sm text-secondary">
                  You can still draft an RA-89 packet now, but if your new lease has not started yet, this is only a projection. The form will only matter once the new lease begins.
                </p>
                <div className="mt-4 rounded-[12px] border border-rule bg-bone p-4 text-sm text-ink-text space-y-3">
                  <p className="font-semibold">What to do now:</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>
                      <strong>Document everything.</strong>
                      Keep the signed lease, any rent increase notices, and the date the new rent starts. Get your DHCR rent history (Form REC-1).
                    </li>
                    <li>
                      <strong>Try to fix it before the lease starts.</strong>
                      Ask the landlord to renegotiate the rent or remove the increase. If you haven’t moved in yet, you may be able to back out or delay the start depending on local tenant law.
                    </li>
                    <li>
                      <strong>Prepare to file later.</strong>
                      If the new lease actually starts and you begin paying the higher rent, then the overcharge can become actionable. The complaint would cover the period after the lease starts, not the weeks before it.
                    </li>
                    <li>
                      <strong>Seek advice.</strong>
                      Talk to a tenant counselor, legal aid, or tenant union in NYC. They can tell you whether the lease is binding and whether there’s a path to cancel or renegotiate.
                    </li>
                  </ol>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-[14px] border border-brass/30 bg-brass-wash/40 px-5 py-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="eyebrow text-brass-deep">Quick fill</span>
                <span className="h-px flex-1 bg-brass/30" />
                <span className="text-[10px] text-muted">3 essentials</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Your full name" value={form.tenantName} onChange={(v) => updateForm('tenantName', v)} placeholder="Jane Tenant" />
                <Input label="Phone (daytime)" value={form.phoneDay} onChange={(v) => updateForm('phoneDay', v)} placeholder="(212) 555-0143" />
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-[10px] border border-brass/25 bg-bone p-3">
                  <div className="sm:col-span-2 flex items-center gap-2">
                    <span className="eyebrow text-brass-deep">Owner / managing agent</span>
                    {ownerLookup.status === 'loading' ? (
                      <span className="text-[10px] text-muted flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full border-2 border-brass border-t-transparent animate-spin" />
                        Looking up HPD…
                      </span>
                    ) : ownerLookup.status === 'found' ? (
                      <span className="text-[10px] text-verdigris font-semibold">✓ HPD match</span>
                    ) : ownerLookup.status === 'not_found' ? (
                      <span className="text-[10px] text-muted">No HPD record — find on your lease</span>
                    ) : null}
                  </div>
                  <div className="sm:col-span-2"><Input label="Name" value={form.ownerName} onChange={(v) => updateForm('ownerName', v)} placeholder="ACME Realty LLC" /></div>
                  <div className="sm:col-span-2"><Input label="Mailing address" value={form.ownerAddress} onChange={(v) => updateForm('ownerAddress', v)} placeholder="100 Main St, New York, NY 10001" /></div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brass-deep">
              <span>Customize</span>
              <span className="text-xs font-normal text-muted">(unit, mailing address, tone, causes…)</span>
            </div>

            <div className="mt-3 space-y-3">
                <Card kicker="More about you">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Apartment unit" value={form.unit} onChange={(v) => updateForm('unit', v)} placeholder="4B" />
                    <Input label="Phone (home)" value={form.phoneHome} onChange={(v) => updateForm('phoneHome', v)} placeholder="(optional)" optional />
                  </div>
                  <label className="mt-3 flex items-start gap-2.5 text-sm text-secondary cursor-pointer">
                    <input type="checkbox" checked={form.mailingSameAsBuilding} onChange={(e) => updateForm('mailingSameAsBuilding', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-rule-strong text-brass focus:ring-brass/25" />
                    <span>Mailing address is the same as the subject building.</span>
                  </label>
                  {!form.mailingSameAsBuilding && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-12"><Input label="Mailing street + apt" value={form.mailingAddress} onChange={(v) => updateForm('mailingAddress', v)} placeholder="123 Other St, Apt 2A" /></div>
                      <div className="sm:col-span-6"><Input label="City" value={form.mailingCity} onChange={(v) => updateForm('mailingCity', v)} /></div>
                      <div className="sm:col-span-3"><Input label="State" value={form.mailingState} onChange={(v) => updateForm('mailingState', v)} placeholder="NY" /></div>
                      <div className="sm:col-span-3"><Input label="ZIP" value={form.mailingZip} onChange={(v) => updateForm('mailingZip', v)} /></div>
                    </div>
                  )}
                </Card>

                <Card kicker="Tone">
                  <p className="text-xs text-secondary mb-3">Adjusts wording in the §14 statement only.</p>
                  <div className="flex flex-wrap gap-2">
                    {(['neutral', 'assertive', 'conciliatory'] as Tone[]).map((t) => (
                      <button key={t} type="button" onClick={() => updateForm('tone', t)} className={`rounded-full px-4 py-1.5 text-xs font-semibold border ${form.tone === t ? 'border-brass bg-brass text-[#1a1305]' : 'border-rule bg-bone text-secondary hover:border-rule-strong'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </Card>

                <Card kicker="Causes (RA-89 §13) — required">
                  <p className="text-xs text-secondary mb-3">
                    A cause is the reason you are filing the RA-89 complaint. Check at least one option that matches why your rent or charges are wrong.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {CAUSE_OPTIONS.map((opt) => {
                      const active = form.causes.includes(opt.id);
                      return (
                        <label key={opt.id} className={`flex items-start gap-2.5 rounded-[8px] border px-3 py-2 cursor-pointer ${active ? 'border-brass bg-brass-wash' : 'border-rule bg-bone hover:border-rule-strong'}`}>
                          <input type="checkbox" checked={active} onChange={() => toggleCause(opt.id)} className="mt-0.5 h-4 w-4 rounded border-rule-strong text-brass focus:ring-brass/25" />
                          <span className={`text-sm font-medium ${active ? 'text-brass-deep' : 'text-ink-text'}`}>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </Card>

                {/* Always rendered (not collapsible) — every field here is
                    required before Generate will run; see requiredMissing. */}
                <Card kicker="Required (tenant type, SCRIE/DRIE, Section 8, electricity)">
                  <p className="text-xs text-secondary mb-3">
                    These affect which RA-89 boxes get checked — answer every one, even if the answer is &quot;No&quot;.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Select label="Tenant type *" value={form.tenantType} onChange={(v) => setForm((prev) => ({ ...prev, tenantType: v as TenantType, tenantTypeTouched: true }))} options={[
                      { v: 'prime', l: 'Prime tenant' },
                      { v: 'sub', l: 'Sub-tenant' },
                      { v: 'roommate', l: 'Roommate' },
                      { v: 'hotel', l: 'Hotel / SRO tenant' },
                    ]} />
                    <Select label="Section 8 *" value={form.section8} onChange={(v) => setForm((prev) => ({ ...prev, section8: v as Section8Program, section8Touched: true }))} options={[
                      { v: 'none', l: 'None' },
                      { v: 'hud', l: 'HUD' },
                      { v: 'nycha', l: 'NYCHA' },
                      { v: 'hcv', l: 'Housing Choice Voucher' },
                      { v: 'hpd', l: 'HPD' },
                    ]} />
                    <Select label="Electricity in rent *" value={form.electricityIncluded === null ? '' : form.electricityIncluded ? 'yes' : 'no'} onChange={(v) => updateForm('electricityIncluded', v === '' ? null : v === 'yes')} options={[
                      { v: '', l: '— select one —' },
                      { v: 'yes', l: 'Yes, included' },
                      { v: 'no', l: 'No, billed separately' },
                    ]} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <Toggle label="SCRIE / DRIE recipient *" value={form.scrieDrie} onChange={(v) => setForm((prev) => ({ ...prev, scrieDrie: v, scrieDrieTouched: true }))} />
                    <Toggle label="Co-op apartment" value={form.coop} onChange={(v) => updateForm('coop', v)} />
                  </div>
                </Card>

                {/* Optional — does NOT block Generate. Default "No" is a
                    fine answer on its own; the index # is only useful (and
                    only shown) once the tenant says Yes. */}
                <div className="rounded-[10px] border border-rule bg-paper-soft px-3 py-3">
                  <Toggle label="This complaint has been raised in court" value={form.raisedInCourt} onChange={(v) => updateForm('raisedInCourt', v)} />
                  {form.raisedInCourt && (
                    <div className="mt-2"><Input label="Court Index No." value={form.courtIndexNo} onChange={(v) => updateForm('courtIndexNo', v)} placeholder="e.g. LT-12345-25" optional /></div>
                  )}
                </div>
            </div>

            {missing.length > 0 && (
              <div className="mt-4 flex items-start gap-2 text-xs text-secondary">
                <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-warning text-bone font-bold text-[10px] flex-shrink-0">i</span>
                <span>Still missing: <span className="font-semibold text-ink-text">{missing.join(', ')}</span>. Packet will generate with blanks for you to write in by hand.</span>
              </div>
            )}

            {/* Unlike the soft hint above, this one BLOCKS Generate — see
                requiredMissing. Shown once here (rather than inside each
                card) since the missing items can come from either the
                causes checklist or the "Required" details card above. */}
            {requiredMissing.length > 0 && (
              <div className="mt-3 flex items-start gap-2 text-xs">
                <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rust text-bone font-bold text-[10px] flex-shrink-0">!</span>
                <span className="text-rust">Still required: <span className="font-semibold">{requiredMissing.join(', ')}</span>.</span>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDraft}
                disabled={isStreaming || requiredMissing.length > 0}
                title={requiredMissing.length > 0 ? `Still required: ${requiredMissing.join(', ')}` : undefined}
                className="btn-brass px-6 py-3 text-sm flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isStreaming ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Drafting…
                  </>
                ) : (
                  <>
                    Generate my filing packet
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h8m0 0L7 3m4 4L7 11" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </>
                )}
              </button>
              {isStreaming && <button type="button" onClick={handleStop} className="btn-ghost px-4 py-2.5 text-sm">Stop</button>}
              {provider && isStreaming && (
                <span className="ml-auto text-[10px] font-mono text-muted uppercase tracking-wider">via {provider}</span>
              )}
            </div>

            {/* Streaming text peek (just gives the user something to watch) */}
            {isStreaming && text && (
              <div className="mt-4 max-h-32 overflow-hidden rounded-[10px] border border-rule bg-paper-soft px-4 py-3 text-[12px] text-muted font-mono leading-relaxed whitespace-pre-wrap relative">
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-paper-soft to-transparent pointer-events-none" />
                {text.slice(-500)}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-[10px] border border-rust-bd bg-rust-bg px-4 py-3">
                <p className="text-sm text-rust">{error}</p>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* DONE — PDF preview is the centerpiece                            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {isDone && text && (
          <>
            {/* Action bar — compact, all 5 actions in one row */}
            <div className="mt-6 flex flex-wrap items-center gap-2 pb-4 border-b border-rule">
              <button type="button" onClick={handleRa89Download} disabled={ra89Filling} className="btn-brass px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-60">
                {ra89Filling ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <IconDownload />}
                {ra89Filling ? 'Filling form…' : 'Download RA-89 (filled)'}
              </button>
              <button type="button" onClick={handleDownload} className="btn-ghost px-4 py-2 text-sm flex items-center gap-1.5">
                <IconDownload /> Companion doc
              </button>
              <button type="button" onClick={handleGmail} className="btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
                <IconGmail /> Send via Gmail
              </button>
              <button type="button" onClick={handleMailto} className="btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
                <IconMail /> Open in Mail
              </button>
              <button type="button" onClick={handlePrint} className="btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
                <IconPrint /> Print
              </button>
              <button type="button" onClick={handleCopy} className="btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
                <IconCopy /> {copied ? 'Copied' : 'Copy text'}
              </button>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                  {generatedAt && generatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {provider && ` · ${provider}`}
                </span>
                <button type="button" onClick={handleDraft} className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5" title="Generate again with current settings">
                  ↻ Redraft
                </button>
              </div>
            </div>

            {ra89Error && (
              <div className="mt-2 rounded-[8px] border border-rust-bd bg-rust-bg px-3 py-2">
                <p className="text-xs text-rust">{ra89Error}</p>
              </div>
            )}

            {/* Email helper note */}
            <p className="mt-2 text-[11px] text-muted leading-relaxed">
              Email opens a compose window with a pre-filled subject and message. Attach the downloaded PDF in your mail client.
            </p>

            {/* PDF preview iframe — the document IS the artifact */}
            <div className="mt-4 rounded-[12px] border border-rule-strong bg-paper-soft p-2 shadow-[0_18px_40px_-18px_rgba(20,14,6,0.35)]">
              {pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#zoom=page-width&toolbar=0&navpanes=0`}
                  title={`RA-89 Filing Packet for BBL ${verdict.bbl}`}
                  className="w-full rounded-[8px] bg-bone"
                  style={{ height: 'min(900px, calc(100vh - 100px))', minHeight: 600 }}
                />
              ) : (
                <div className="h-[600px] flex items-center justify-center bg-bone rounded-[8px]">
                  <div className="text-center">
                    <div className="h-6 w-6 mx-auto mb-3 rounded-full border-2 border-brass border-t-transparent animate-spin" />
                    <p className="text-sm text-muted">Rendering your PDF…</p>
                  </div>
                </div>
              )}
            </div>

            {/* Next steps — promoted to a hero panel */}
            <div className="mt-6 rounded-[16px] border-2 border-brass bg-gradient-to-br from-brass-wash via-bone to-brass-wash/60 px-6 sm:px-8 py-6 shadow-[0_18px_40px_-18px_rgba(176,122,26,0.4)]">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="eyebrow text-brass-deep tracking-[0.22em]">What to do next</span>
                <span className="font-display italic text-xs text-brass-deep">4 steps · ~10 min</span>
              </div>
              <h3 className="font-display text-[26px] sm:text-[30px] leading-tight tracking-tight text-ink-text">
                You&rsquo;re four steps from filing.
              </h3>
              <div className="mt-2 h-[2px] w-12 bg-brass" />

              <ol className="mt-5 space-y-4">
                <NextLine
                  n="1"
                  title="Get the official RA-89 form"
                  body={
                    <>
                      The fillable PDF is on the DHCR site.{' '}
                      <a href="https://hcr.ny.gov/form-ra-89" target="_blank" rel="noopener noreferrer" className="font-semibold text-brass-deep underline decoration-brass underline-offset-2 hover:text-brass">
                        Download RA-89 ↗
                      </a>
                    </>
                  }
                />
                <NextLine
                  n="2"
                  title="Transcribe values from your packet"
                  body={<>Copy each <span className="font-mono text-brass-deep text-[12px]">§N</span> value from Section A into the matching box on RA-89. Paste the §14 paragraph from your packet verbatim into the form&rsquo;s Section 14.</>}
                />
                <NextLine
                  n="3"
                  title="Sign and bundle evidence"
                  body={<>Sign page 4 of RA-89. Behind the form, clip your packet PDF, copies of every lease, rent receipts, and cancelled checks.</>}
                />
                <NextLine
                  n="4"
                  title="File"
                  body={
                    <div className="space-y-2 mt-1">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-verdigris text-bone font-mono text-[10px] font-bold flex-shrink-0">A</span>
                        <span>
                          <span className="font-semibold text-ink-text">Online (fastest)</span> —{' '}
                          <a href="https://rent.hcr.ny.gov/RentConnect/Tenant/RentOverchargeOverview" target="_blank" rel="noopener noreferrer" className="font-semibold text-brass-deep underline decoration-brass underline-offset-2 hover:text-brass">
                            DHCR Rent Connect ↗
                          </a>
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate text-bone font-mono text-[10px] font-bold flex-shrink-0">B</span>
                        <span>
                          <span className="font-semibold text-ink-text">By mail</span> — two copies, keep one:
                          <span className="block mt-1 font-mono text-[11px] text-secondary leading-relaxed pl-3 border-l-2 border-brass">
                            DHCR · Office of Rent Administration<br />
                            Gertz Plaza · 92-31 Union Hall Street, 6th Floor<br />
                            Jamaica, NY 11433
                          </span>
                        </span>
                      </div>
                    </div>
                  }
                />
              </ol>

              <div className="mt-6 rounded-[10px] border border-warning-bd bg-bone px-4 py-3">
                <p className="text-[12px] leading-relaxed text-secondary">
                  <span className="font-semibold text-warning">Pro tip · strongest evidence:</span>{' '}
                  request your apartment&rsquo;s certified rent history first via{' '}
                  <a href="https://hcr.ny.gov/records-access" target="_blank" rel="noopener noreferrer" className="font-semibold text-brass-deep underline decoration-brass/60 underline-offset-2 hover:text-brass">
                    DHCR Records Access (REC-1)
                  </a>
                  . It anchors the legal rent and makes your complaint significantly harder to dismiss.
                </p>
              </div>
            </div>

            {/* Tiny corner: edit raw text + redraft */}
            <details className="mt-4 group" open={showRaw} onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer text-[11px] text-muted hover:text-secondary inline-flex items-center gap-1.5 select-none">
                <svg className="h-3 w-3 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Edit the underlying text
              </summary>
              <div className="mt-2 rounded-[10px] border border-rule bg-bone overflow-hidden">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={Math.min(28, Math.max(14, text.split('\n').length + 2))}
                  className="block w-full bg-transparent px-4 py-3 font-mono text-[12px] leading-[1.6] text-ink-text focus:outline-none resize-none"
                  spellCheck={false}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted">Edits regenerate the PDF preview above as you type.</p>
            </details>

            <div className="mt-4 rounded-[10px] border border-warning-bd bg-warning-bg/70 px-3 py-2">
              <p className="text-[11px] text-warning leading-relaxed">
                <span className="font-semibold">Not legal advice.</span> Review every line before filing and consider speaking with a tenant attorney.
                This is not a law firm and use of this tool does not create an attorney-client
                relationship. Not affiliated with or endorsed by DHCR or any NY state agency.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Tiny primitives
// ──────────────────────────────────────────────────────────────────────

function NextLine({ n, title, body }: { n: string; title: string; body: React.ReactNode }) {
  return (
    <li className="flex gap-4 items-start">
      <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-brass bg-bone font-display font-bold text-brass-deep text-[16px] shadow-[0_2px_4px_rgba(176,122,26,0.2)]">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h4 className="font-display text-[16px] font-semibold text-ink-text leading-snug">{title}</h4>
        <div className="mt-1 text-[13px] text-secondary leading-relaxed">{body}</div>
      </div>
    </li>
  );
}

function Card({ kicker, className = '', children }: { kicker: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-[12px] border border-rule bg-paper-soft/40 px-4 py-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="eyebrow">{kicker}</span>
        <span className="h-px flex-1 bg-rule" />
      </div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, optional }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; optional?: boolean }) {
  return (
    <label className="block">
      <span className="eyebrow block">
        {label}
        {optional && <span className="text-muted normal-case tracking-normal text-[10px] font-normal ml-1">(optional)</span>}
      </span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`mt-1.5 ${inputClass}`} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label className="block">
      <span className="eyebrow block">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 ${inputClass}`}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-rule-strong text-brass focus:ring-brass/25" />
      <span className="text-sm text-secondary">{label}</span>
    </label>
  );
}

function IconDownload() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 2v8m0 0L4 7m3 3 3-3M2 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function IconGmail() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-rust text-bone text-[9px] font-bold">G</span>
  );
}
function IconMail() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="10" height="8" rx="1" /><path d="M2 4l5 4 5-4" /></svg>;
}
function IconPrint() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 5V2h8v3M3 9H1v4h12V9h-2M3 9h8v4H3z" strokeLinejoin="round" /></svg>;
}
function IconCopy() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="8" height="8" rx="1.5" /><path d="M2 9V3a1 1 0 0 1 1-1h6" /></svg>;
}
