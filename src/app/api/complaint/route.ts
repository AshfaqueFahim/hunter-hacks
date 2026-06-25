import { z } from 'zod';
import {
  buildFieldMap,
  streamComplaint,
  activeProviderName,
  type ComplaintInput,
} from '@/lib/complaint';

// ──────────────────────────────────────────────────────────────────────
// POST /api/complaint — second stop on the "Generate my filing packet"
// path (first stop: ComplaintPreview.tsx's handleDraft()).
//
// Job here is narrow and mechanical: (1) confirm an LLM key is even
// configured, (2) validate the request body against the Zod schemas
// below — this is the ONLY validation layer between whatever the browser
// sends and the LLM prompt, so it's deliberately strict (bounded string
// lengths, enums for every categorical field), (3) hand off the validated
// input to src/lib/complaint.ts to actually talk to the model, and
// (4) re-emit the model's streamed output as NDJSON so the browser can
// render tokens as they arrive.
// ──────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
// Streaming the full RA-89 attachment can take 30-40s on a long lease history.
// Default Hobby cap is 10s; bump to 60 (Hobby max) so streams aren't cut.
export const maxDuration = 60;

// Below: one Zod schema per nested shape in the request body. These
// mirror (but intentionally don't import) the TypeScript types in
// src/lib/stabilization.ts (Verdict), src/lib/overcharge.ts (Estimate),
// and src/lib/complaint.ts (ComplaintInput) — Zod can't derive runtime
// validation from a `type`, so the shapes are kept in sync by hand.
const VerdictSchema = z.object({
  bbl: z.string().min(1).max(20),
  status: z.enum(['likely_stabilized', 'not_listed', 'unknown']),
  unit_count_latest: z.number().int().min(0).max(100_000).optional(),
  unit_count_year: z.number().int().min(1900).max(2100).optional(),
  on_dhcr_list_latest: z.boolean(),
  source_year_max: z.number().int().min(1900).max(2100).optional(),
  dhcr_verify_url: z.string().max(500),
});

// One renewal-lease's worth of math from src/lib/overcharge.ts's
// year-by-year RGB-order comparison — what the tenant paid vs. what was
// legally allowed for that lease term.
const YearAnalysisSchema = z.object({
  year: z.number(),
  lease_start: z.string(),
  lease_end: z.string(),
  term_months: z.union([z.literal(12), z.literal(24)]),
  allowed_pct: z.number().nullable(),
  actual_pct: z.number().nullable(),
  legal_monthly: z.number(),
  actual_monthly: z.number(),
  overcharge_monthly: z.number(),
  months_in_lease: z.number(),
  months_within_limit: z.number(),
  overcharge_within_limit: z.number(),
});

const FINITE_DOLLAR = z.number().min(0).max(1_000_000);

// The tenant's actual first/move-in lease — see BaselineLease in
// src/lib/overcharge.ts. Must stay in the schema (not just the
// TypeScript type) or Zod silently strips it from the parsed body before
// it ever reaches buildUserMessage(), reintroducing the "second lease
// mistaken for the first" bug this schema field exists to prevent.
const BaselineLeaseSchema = z
  .object({
    lease_start: z.string(),
    lease_end: z.string(),
    term_months: z.union([z.literal(12), z.literal(24)]),
    monthly_rent: FINITE_DOLLAR,
  })
  .nullable();

// The overcharge calculation produced by /api/estimate, fed straight
// back in by the client. Capped array lengths/string lengths everywhere
// below exist purely to bound how much an attacker-controlled body could
// inflate the eventual LLM prompt (and therefore token cost).
const EstimateSchema = z.object({
  mode: z.literal('history_only'),
  legal_rent_monthly: FINITE_DOLLAR,
  actual_rent_monthly: FINITE_DOLLAR,
  overcharge_monthly: FINITE_DOLLAR,
  overcharge_total_within_limit: z.number().min(0).max(100_000_000),
  years_analyzed: z.array(YearAnalysisSchema).max(40),
  caveats: z.array(z.string().max(500)).max(20),
  baseline_lease: BaselineLeaseSchema,
});

const TenantTypeSchema = z.enum(['prime', 'sub', 'hotel', 'roommate']);
const Section8Schema = z.enum(['none', 'hud', 'nycha', 'hcv', 'hpd']);
const ToneSchema = z.enum(['neutral', 'assertive', 'conciliatory']);
const CauseSchema = z.enum([
  'mci',
  'iai',
  'rent_reduction_order',
  'missing_registrations',
  'fmra',
  'parking',
  'illegal_fees',
  'security_deposit',
  'other',
]);

const SHORT_TEXT = z.string().max(200);
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// The full POST body. `verdict`/`estimate`/`address` are required (they
// come from earlier stages of the app, not user typing); everything else
// is optional because the tenant may not have filled in every field —
// buildFieldMap() in src/lib/complaint.ts supplies bracketed placeholders
// ("[ASK TENANT]" etc.) for whatever's missing here.
const RequestSchema = z.object({
  verdict: VerdictSchema,
  estimate: EstimateSchema,
  address: z.string().min(1).max(300),

  tenantName: SHORT_TEXT.optional(),
  unit: z.string().max(50).optional(),
  mailingAddress: z.string().max(300).optional(),
  mailingCity: SHORT_TEXT.optional(),
  mailingState: z.string().max(20).optional(),
  mailingZip: z.string().max(20).optional(),

  tenantPhoneHome: z.string().max(40).optional(),
  tenantPhoneDay: z.string().max(40).optional(),

  tenantType: TenantTypeSchema.optional(),
  scrieDrie: z.boolean().optional(),
  section8: Section8Schema.optional(),
  coop: z.boolean().optional(),

  moveInDate: ISO_DATE.optional(),
  initialRent: z.number().min(0).max(1_000_000).optional(),

  electricityIncluded: z.boolean().optional(),

  ownerName: z.string().max(300).optional(),
  ownerAddress: z.string().max(500).optional(),
  ownerPhone: z.string().max(40).optional(),

  causes: z.array(CauseSchema).max(9).optional(),

  securityDepositAmount: z.number().min(0).max(1_000_000).optional(),
  securityDepositPaidOn: ISO_DATE.optional(),

  raisedInCourt: z.boolean().optional(),
  courtIndexNo: z.string().max(80).optional(),

  tone: ToneSchema.optional(),
});

/**
 * Streams NDJSON. Each line is a JSON object:
 *   { "type": "fields",   "data": { ... } }       — emitted once, first
 *   { "type": "provider", "data": "openai"|... }  — which model is being used
 *   { "type": "text",     "data": "..." }         — repeated for each delta
 *   { "type": "done" }                            — final event
 *   { "type": "error",    "data": "message" }     — on failure
 */
export async function POST(request: Request): Promise<Response> {
  // Fail fast: streamComplaint() further down would throw this same
  // error mid-stream, but catching it here lets us return a normal JSON
  // 503 instead of an awkward "stream that opens then immediately errors".
  const provider = activeProviderName();
  if (!provider) {
    return Response.json(
      {
        error:
          'No LLM provider configured. Set OPENAI_API_KEY (preferred) or ANTHROPIC_API_KEY in .env.local.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The single validation gate for everything that ends up in the LLM
  // prompt. Anything that doesn't match RequestSchema (wrong types, an
  // out-of-enum cause, an over-length string) is rejected here with a
  // 422 — it never reaches buildFieldMap/streamComplaint below.
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const input: ComplaintInput = parsed.data;
  // Pure, synchronous derivation of "what we're about to tell the model"
  // (placeholders filled in, etc.) — sent to the client immediately as
  // the 'fields' event so the UI could show a preview even before the
  // model starts responding (see buildFieldMap in src/lib/complaint.ts).
  const fields = buildFieldMap(input);

  const encoder = new TextEncoder();
  // Bridges the pull-based AsyncGenerator from streamComplaint() to a
  // push-based web ReadableStream that Response() can return directly.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Every event is one line of JSON + '\n' — see the NDJSON shape
      // documented above the function, and the matching parser in
      // ComplaintPreview.tsx's handleDraft().
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      send({ type: 'provider', data: provider });
      send({ type: 'fields', data: fields });

      try {
        // This is where the actual model call happens — streamComplaint
        // (src/lib/complaint.ts) yields text deltas as the model
        // generates them; we forward each one immediately.
        for await (const delta of streamComplaint(input, request.signal)) {
          send({ type: 'text', data: delta });
        }
        send({ type: 'done' });
      } catch (err) {
        console.error('Complaint stream failed:', err);
        // Client navigated away / clicked Stop — request.signal is
        // already aborted, so don't bother sending an error event into
        // a stream nobody's listening to.
        if (request.signal.aborted) return;
        send({
          type: 'error',
          data: 'The drafting service failed. Please try again.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
