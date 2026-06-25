# Design — NYC Rent Stabilization Lookup + Overcharge Estimator

## 1. Context

NYC has roughly **one million rent-stabilized units**, and a meaningful fraction of tenants in those units don't know their apartment is stabilized. Landlords frequently charge above the legal rent, count on tenants not checking, and rely on the four-year overcharge limitations clock running out. The fix is information: tell a tenant (a) whether their building is on the DHCR rent-stabilized list, (b) what the legal rent should be given Rent Guidelines Board (RGB) increases since their first lease, and (c) hand them a draft complaint they can actually file.

**Hackathon goal.** Demo-ready web app: tenant enters an address, gets a stabilization verdict in seconds, optionally enters their rent history to get an overcharge estimate, and downloads a pre-filled DHCR complaint draft. Manhattan focus for the demo (works city-wide, but pitch will use Manhattan addresses).

**Non-goals.** This is *not* legal advice, *not* a substitute for DHCR rent history requests, and the registration-history piece will rely on user-provided rent figures rather than scraping individual unit registrations (which DHCR doesn't expose in bulk).

---

## 2. Architecture Overview

```
                             ┌─────────────────────────┐
                             │  Browser (Next.js UI)   │
                             │  - Address autocomplete │
                             │  - Result card          │
                             │  - Rent-history form    │
                             │  - Complaint preview    │
                             └────────────┬────────────┘
                                          │ fetch
                                          ▼
                             ┌─────────────────────────┐
                             │  Next.js API routes     │
                             │  /api/lookup            │
                             │  /api/estimate          │
                             │  /api/complaint         │
                             └─────┬──────────┬────────┘
                                   │          │
                  ┌────────────────┘          └─────────────────┐
                  ▼                                             ▼
   ┌──────────────────────────┐                  ┌──────────────────────────┐
   │  External services       │                  │  Local SQLite (data/)    │
   │  - NYC GeoSearch (Pelias)│                  │  - buildings (BBL keyed) │
   │  - Anthropic API (draft) │                  │  - rgb_increases         │
   │  - (opt) Geoclient v2    │                  │  - lookups (analytics)   │
   └──────────────────────────┘                  └──────────────────────────┘
                                                              ▲
                                                              │ seed once
                                                  ┌──────────────────────────┐
                                                  │  Seed pipeline (scripts) │
                                                  │  NYCDB rentstab_v2 CSV   │
                                                  │  RGB Order #1..#57 table │
                                                  └──────────────────────────┘
```

**Why this shape.**
- All data the app needs at runtime is local. No paid APIs, no rate limits, fast lookups. The only network calls are GeoSearch (free, no key) and Anthropic (for complaint drafting only).
- Seed pipeline is a one-time concern. Reproducible from public sources but never on the critical path.
- BBL (Borough-Block-Lot, 10-digit) is the universal join key. Every dataset we touch uses it.

---

## 3. Data Sources

| Source | What we get | Format | Where it lives |
|---|---|---|---|
| **NYCDB `rentstab_v2`** | Per-BBL rent-stabilized unit counts by year, address, owner, DHCR list flag | CSV | Local SQLite after seed |
| **DHCR Rent-Stabilized Building Lists** (rentguidelinesboard.cityofnewyork.us) | Official borough PDFs, used as a sanity check | PDF | Not imported, reference only |
| **RGB Apartment Orders #1–#57** | Annual % increase for 1-yr / 2-yr leases, vacancy allowance | Hand-keyed JSON / SQL seed | Local SQLite |
| **NYC GeoSearch** (geosearch.planninglabs.nyc) | Address normalization → BBL, lat/lng | JSON over HTTPS, no key | Called per request |
| **Anthropic API (Claude)** | Draft DHCR overcharge complaint text | JSON | Called only when user clicks "Draft complaint" |

**Notes.**
- NYCDB's `rentstab_v2` is a community-maintained scrape of NYC DOF tax bill PDFs (which expose rent-stab unit counts) and the DHCR list. It's the cleanest single source. The wiki notes 2018–2023 coverage in the v2 file; we'll pull the latest published snapshot.
- DHCR is officially the authoritative list, but the PDFs are unwieldy. We keep DHCR as a reference and expose a "Verify on DHCR" link from the result card so users can cross-check.
- RGB orders are public, small (~57 rows × ~5 columns), and rarely change — checking them in as a static seed file is fine.

---

## 4. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router) + TypeScript** | One repo, same language end-to-end, Vercel deploys in minutes |
| UI | **Tailwind + shadcn/ui** | Decent-looking components without design work |
| DB | **SQLite via `better-sqlite3`** | File-based, ships with the repo, sub-ms lookups |
| Migrations / queries | **Drizzle ORM** (or raw SQL — fine for a hackathon) | Type-safe queries; if it slows us down, drop to raw |
| LLM client | **`@anthropic-ai/sdk`** | For complaint drafting, with prompt caching on the system prompt |
| Hosting | **Vercel** | Zero-config; SQLite file ships with the build |


---

## 5. Project Structure

```
hunter-hacks/
├── Design.md                    # this file
├── README.md
├── package.json
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
│
├── data/
│   ├── app.db                   # SQLite (gitignored, regenerated by seed)
│   ├── seed/
│   │   ├── rentstab_v2.csv      # NYCDB snapshot (gitignored or LFS)
│   │   └── rgb_orders.json      # hand-curated, checked in
│   └── README.md                # how to refresh the seed
│
├── scripts/
│   ├── seed.ts                  # CSV + JSON → SQLite
│   └── refresh-data.ts          # download latest NYCDB snapshot
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # landing / address input
│   │   ├── result/[bbl]/page.tsx
│   │   ├── api/
│   │   │   ├── lookup/route.ts
│   │   │   ├── estimate/route.ts
│   │   │   └── complaint/route.ts
│   │   └── layout.tsx
│   │
│   ├── components/
│   │   ├── AddressSearch.tsx    # GeoSearch-backed autocomplete
│   │   ├── ResultCard.tsx       # stabilized? + unit count + DHCR link
│   │   ├── RentHistoryForm.tsx  # multi-row lease entry
│   │   ├── OverchargeSummary.tsx
│   │   └── ComplaintPreview.tsx
│   │
│   ├── lib/
│   │   ├── db.ts                # better-sqlite3 client
│   │   ├── geosearch.ts         # NYC GeoSearch wrapper
│   │   ├── stabilization.ts     # BBL → stabilization verdict
│   │   ├── rgb.ts               # RGB increase lookups
│   │   ├── overcharge.ts        # legal-rent calculation engine
│   │   ├── complaint.ts         # Claude prompt + post-processing
│   │   └── types.ts
│   │
│   └── data/
│       └── disclaimer.ts        # legal disclaimer copy, surfaced in UI
│
└── tests/
    ├── overcharge.test.ts
    └── stabilization.test.ts
```

**What's modular.** Each `lib/` file is a pure module with one job and one export surface. Routes are thin — they parse input, call one or two lib functions, return JSON. UI components are dumb — they take props, render. This is what lets us split the work cleanly into the phases below.

---

## 6. Database Schema

```sql
-- buildings: one row per BBL we know about
CREATE TABLE buildings (
  bbl              TEXT PRIMARY KEY,           -- 10-digit BBL
  borough          TEXT NOT NULL,              -- MN, BX, BK, QN, SI
  address          TEXT NOT NULL,              -- normalized "123 W 45 ST"
  zipcode          TEXT,
  owner_name       TEXT,
  unit_count_latest INTEGER,                   -- most recent rent-stab unit count
  unit_count_year   INTEGER,                   -- the year that count came from
  on_dhcr_list_latest INTEGER NOT NULL,        -- 0/1 boolean
  source_year_max  INTEGER,                    -- newest year of evidence we have
  lat              REAL,
  lng              REAL
);
CREATE INDEX idx_buildings_zip   ON buildings(zipcode);
CREATE INDEX idx_buildings_addr  ON buildings(address);

-- rgb_increases: one row per RGB Apartment Order
CREATE TABLE rgb_increases (
  order_no         INTEGER PRIMARY KEY,        -- e.g. 57
  lease_start_from TEXT NOT NULL,              -- ISO date, e.g. 2025-10-01
  lease_start_to   TEXT NOT NULL,
  one_year_pct     REAL NOT NULL,              -- 3.0
  two_year_pct     REAL NOT NULL,              -- 4.5
  notes            TEXT
);

-- lookups: lightweight analytics (optional, useful for the demo "we've helped N tenants")
CREATE TABLE lookups (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  bbl              TEXT,
  searched_at      TEXT NOT NULL DEFAULT (datetime('now')),
  was_stabilized   INTEGER,
  estimated_overcharge_cents INTEGER
);
```

**Key choices.**
- `buildings.unit_count_latest > 0` *or* `on_dhcr_list_latest = 1` is the working definition of "this building probably has stabilized units." We surface both signals in the UI so the user can see the basis.
- We don't try to store per-unit rent registration history. That data isn't bulk-available; the user supplies their own rent history through the form.
- `lookups` is for the demo narrative. No PII, just BBL + outcome.

---

## 7. Core Flows

### 7.1 Address → Stabilization verdict

1. User types address; `AddressSearch.tsx` calls `https://geosearch.planninglabs.nyc/v2/autocomplete`.
2. On selection, the chosen feature carries `addendum.pad.bbl`. Frontend POSTs `{ bbl, address }` to `/api/lookup`.
3. `/api/lookup` calls `lib/stabilization.ts → verdict(bbl)` which queries `buildings` and returns:
   ```ts
   type Verdict = {
     bbl: string;
     status: 'likely_stabilized' | 'not_listed' | 'unknown';
     unit_count_latest?: number;
     unit_count_year?: number;
     on_dhcr_list_latest: boolean;
     source_year_max?: number;
     dhcr_verify_url: string;        // deep link to apps.hcr.ny.gov/BuildingSearch
   };
   ```
4. `ResultCard.tsx` renders the verdict + a "Check your rent" CTA.

### 7.2 Rent history → Overcharge estimate

1. User enters lease history: `[{ start_date, end_date, monthly_rent, lease_term_months }]`. They also optionally enter a "registered base rent" if they've requested their DHCR rent history.
2. `/api/estimate` calls `lib/overcharge.ts → estimate(history, baseRent?)`.
3. **Algorithm (simplified for the hackathon):**
   - If user provides a registered base rent + base year, walk forward year-by-year applying the RGB increase that matches the lease term (1-yr vs 2-yr) for each renewal window. That gives `legal_rent_today`.
   - If no base rent is provided, walk the user's *own* lease history forward and flag any year where their rent went up by more than RGB allowed. The output is "you were overcharged $X across N years."
   - Skip MCI/IAI adjustments for the demo. Surface a disclaimer noting these can shift the legal rent.
4. Response:
   ```ts
   type Estimate = {
     legal_rent_monthly: number;
     actual_rent_monthly: number;
     overcharge_monthly: number;
     overcharge_total_within_limit: number;  // 4-year overcharge clock
     years_analyzed: { year: number; allowed_pct: number; actual_pct: number; overcharge: number }[];
     caveats: string[];                      // e.g. "MCI/IAI not modeled"
   };
   ```

### 7.3 Estimate → Draft complaint

1. User clicks "Draft my complaint". `/api/complaint` is called with the verdict + estimate.
2. `lib/complaint.ts` builds a prompt for Claude (Sonnet 4.6 is fine here; cache the system prompt with the DHCR-form instructions).
3. The system prompt contains: the structure of DHCR Form RA-89 (Tenant's Complaint of Rent and/or Other Specific Overcharges in a Rent Stabilized Apartment), tone guidance ("plain English, factual, first person"), and a template skeleton.
4. The user message contains the verdict + estimate JSON.
5. Output: a string of complaint body text + a structured field map (name placeholder, address, BBL, rent figures, etc).
6. Frontend renders preview, "Copy" and "Download as .txt" buttons. (PDF export is Phase 4 polish.)

---

## 8. External API Contracts (just the shapes we depend on)

**NYC GeoSearch — autocomplete**
```
GET https://geosearch.planninglabs.nyc/v2/autocomplete?text=350+5th+ave
→ { features: [{ properties: { label, addendum: { pad: { bbl, bin } } }, geometry: { coordinates } }, ...] }
```
No API key, no auth. Rate-limited politely; cache on the client by query string.

**Anthropic API**
```
POST https://api.anthropic.com/v1/messages
model: "claude-sonnet-4-6"
system: [ { type: "text", text: <DHCR form template + style guide>, cache_control: { type: "ephemeral" } } ]
messages: [ { role: "user", content: JSON.stringify({ verdict, estimate, tenant_name_placeholder }) } ]
```
Cache the system prompt — every complaint reuses it.

---

## 9. Implementation Phases

Each phase ends with something demonstrable. Phases are ordered so we always have a working app, even if we run out of time.

### Phase 0 — Scaffold and seed (foundation)
**Outcome:** `npm run dev` opens a blank Next.js app. `npm run seed` populates `data/app.db` with buildings + RGB rows. `select count(*) from buildings` returns ~50K+.

Subtasks:
1. `create-next-app` with TS + Tailwind + App Router; add `shadcn/ui`.
2. Add `better-sqlite3`, `drizzle-orm`, `@anthropic-ai/sdk`, `zod`.
3. Define schema in `src/lib/db.ts` (matches §6).
4. Hand-key `data/seed/rgb_orders.json` from RGB Apartment Orders #1–#57. ~30 min of data entry.
5. Download NYCDB `rentstab_v2.csv` to `data/seed/`. Document the URL in `data/README.md`.
6. Write `scripts/seed.ts`: read CSV, transform per-BBL row to buildings row (compute `unit_count_latest` = max non-zero `uc20XX`, `unit_count_year` = corresponding year, `on_dhcr_list_latest` = max `dhcr20XX` flag).
7. Add `.env.example` with `ANTHROPIC_API_KEY=`.
8. Sanity check: query a known stabilized address (e.g. a large pre-1974 Manhattan building) and confirm it's there.

### Phase 1 — Address lookup MVP (the demo's first 60 seconds)
**Outcome:** Type an address, see "Yes, this building has stabilized units" or "No record" with a DHCR verify link.

Subtasks:
1. `lib/geosearch.ts`: thin wrapper around the autocomplete endpoint. Returns `{ label, bbl, lat, lng }[]`.
2. `components/AddressSearch.tsx`: combobox with debounce (~250ms), keyboard navigation.
3. `lib/stabilization.ts`: `verdict(bbl)` → `Verdict` (see §7.1). Pure function over `buildings`.
4. `app/api/lookup/route.ts`: POST `{ bbl, address }` → `Verdict`. Validate with `zod`.
5. `components/ResultCard.tsx`: render verdict. Show unit count, year of evidence, DHCR cross-check link, plus a clear disclaimer.
6. Wire it on `app/page.tsx`. Insert one row into `lookups`.
7. Manual smoke test: 5 known-stabilized addresses, 2 known-unstabilized (a new Hudson Yards condo, a 1-2 family house). All correct.

### Phase 2 — Overcharge estimator
**Outcome:** After the verdict, user enters lease history and sees "Your legal rent is $X; you may have been overcharged $Y."

Subtasks:
1. `lib/rgb.ts`: `getIncrease(leaseStart: Date, termMonths: 12 | 24)` → `pct`. Looks up the right RGB order for the lease start.
2. `lib/overcharge.ts`: implement the algorithm in §7.2. Pure functions, no DB. Heavily unit-tested.
3. `tests/overcharge.test.ts`: at least 5 cases — no overcharge, mid-stream overcharge, overcharge offset by later under-charge, missing data, lease term mismatch.
4. `app/api/estimate/route.ts`: POST `{ history, baseRent? }` → `Estimate`. `zod`-validated.
5. `components/RentHistoryForm.tsx`: dynamic rows, date pickers, currency input.
6. `components/OverchargeSummary.tsx`: per-year breakdown table + headline number.
7. Pluck the headline overcharge number into the `lookups` row (in cents).

### Phase 3 — Draft complaint
**Outcome:** User clicks a button and gets editable, copyable, plain-English complaint text pre-filled with their numbers.

Subtasks:
1. Pull DHCR Form RA-89 structure into a system-prompt template stored in `src/lib/complaint-template.ts`. Cite the form's section headers.
2. `lib/complaint.ts`: build prompt, call `claude-sonnet-4-6`, parse response. Use prompt caching on system. Set sensible `max_tokens` (~1500).
3. `app/api/complaint/route.ts`: POST `{ verdict, estimate, tenant_name?, unit? }` → `{ text, fieldMap }`. Stream tokens to the UI for the demo "wow" effect.
4. `components/ComplaintPreview.tsx`: streamed render, "Copy", "Download .txt", and a prominent "This is a draft, not legal advice" banner.
5. Provide a "where to file" footer linking to `apps.hcr.ny.gov` with the form ID.

### Phase 4 — Polish, demo prep, deploy
**Outcome:** Lives at a vercel.app URL. Looks like a real product. Has 3 stock demo addresses for the pitch.

Subtasks:
1. Hard-coded demo links on the landing page ("Try: 350 W 50th St" etc) — pre-pick addresses we know give a clean overcharge story.
2. Map preview of the building (Mapbox or Leaflet, only if cheap).
3. Loading states, empty states, "no record found" copy that suggests next steps.
4. Strong disclaimer in the footer + a `/about` page explaining what we are and aren't.
5. `vercel.json` config; commit `app.db` (or run seed at build time — choose based on file size).
6. Practice run: 90-second pitch with a real address, no shortcuts.

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| NYCDB CSV is big or stale | Cap to NYC-only buildings on import; document the snapshot date; show "data current as of YYYY" in the UI |
| Address that GeoSearch can't normalize | Fall back to a manual "enter borough + house # + street" form; degrade gracefully |
| User has no rent history → estimator can't run | Make the estimator optional. The verdict page is valuable on its own |
| Overcharge math is wrong → bad advice | Heavy unit tests in Phase 2; prominent disclaimer; only show ranges, not single-dollar precision |
| Anthropic API down during demo | Pre-generate a sample complaint for the demo addresses and ship it as a fallback |
| Privacy of user-entered rent | All inputs stay client-side or in a single ephemeral request; nothing about an individual lease is persisted in `lookups` |

---

## 11. Verification

End-to-end before declaring "done":
1. `npm install && npm run seed && npm run dev` — fresh clone works.
2. Type a known stabilized Manhattan address → verdict says stabilized, links to DHCR.
3. Type a known non-stabilized address (new condo) → verdict says not listed.
4. Fill in a lease history with a 10% YoY rent jump → estimator flags overcharge above the RGB ceiling.
5. Click "Draft complaint" → text streams in, includes the address, BBL, overcharge figure, and tenant placeholder.
6. `npm test` — all `overcharge.test.ts` and `stabilization.test.ts` cases pass.
7. Production deploy returns the same results within 500ms p50.

---

## 12. Open Questions (for refinement)

These are the decisions we should lock before Phase 1 begins. None block scaffolding (Phase 0).

1. **Tech stack** — Next.js + TS as recommended, or FastAPI + React?
2. **Map view** — in scope for Phase 4, or skip entirely?
3. **NYCDB snapshot policy** — check the CSV into the repo, fetch at build time, or document a manual refresh?
4. **Complaint output format** — text-only is in scope; PDF export is a stretch goal. Confirm.
5. **Demo addresses** — need 3 real Manhattan addresses where the overcharge story is clean. Worth picking these early so the data work matches the pitch.
