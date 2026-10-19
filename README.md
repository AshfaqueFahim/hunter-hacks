# Am I Rent Stabilized?

[amirentstabilized.nyc](https://amirentstabilized.nyc) is a free, public lookup for New York City tenants.

1. **Does my building have rent-stabilized units?** Search an address and the app checks the
   building against public NY State Division of Housing and Community Renewal (DHCR) and NYCDB
   rent-stabilization records.
2. **Given my lease history, am I being overcharged?** Enter every lease you've signed and the app
   walks the rent forward through each NYC Rent Guidelines Board (RGB) order, flagging any
   renewal that rose above the legal increase.
3. **Help me file.** Drafts a plain-English cover statement and fills the official
   [DHCR Form RA-89](https://hcr.ny.gov/form-ra-89) (Tenant's Complaint of Rent Overcharges).

Available in English, Spanish, Chinese and Bengali. Not legal advice, not a law firm, and not
affiliated with DHCR or any NY state agency.

## Data sources

| Source | What we use it for |
|---|---|
| [DHCR](https://hcr.ny.gov/) | Building registration list: whether a building registered stabilized units in a given year. The authoritative record for a specific apartment is its **rent history**, which tenants request from DHCR with [Form REC-1](https://hcr.ny.gov/records-access). |
| [NYCDB](https://www.nycdb.info/) (`rentstab`, `rentstab_v2`) | Stabilized-unit counts per building, scraped from NYC Department of Finance tax bills by [JustFix's nyc-doffer](https://github.com/JustFixNYC/nyc-doffer). Covers 2007–2024. |
| [Rent Guidelines Board](https://rentguidelinesboard.cityofnewyork.us/) | Apartment Orders #1 to #58: the legal one- and two-year renewal increases for every lease period since 1968, hand-keyed into [`data/seed/rgb_orders.json`](data/seed/rgb_orders.json). Order #58 (leases starting Oct 1, 2026 – Sep 30, 2027) is the 0% / 0% rent freeze adopted June 25, 2026. |
| [NYC Planning Labs GeoSearch](https://geosearch.planninglabs.nyc/) | Address autocomplete → BBL (borough-block-lot) and building ID. |

See [`data/README.md`](data/README.md) for download URLs and how to refresh each dataset.

## How the overcharge estimate works

The logic is in [`src/lib/overcharge.ts`](src/lib/overcharge.ts) and is covered by
[`tests/overcharge.test.ts`](tests/overcharge.test.ts).

1. Leases are sorted oldest-first. The **first lease is taken as the starting legal rent**.
2. For each later lease, we look up the RGB order in effect on the lease **start date** and
   apply its one- or two-year rate to the *previous legal rent* (not the previous actual rent).
   So an overcharge carries forward, and a later undercharge never cancels an earlier overcharge.
3. If the actual rent exceeds the computed legal rent, the difference is the monthly overcharge.
4. Only months inside the **6-year lookback window** (Housing Stability and Tenant Protection
   Act of 2019, HSTPA) count toward the total.
5. Pre-HSTPA leases that the tenant flags as vacancy leases use the historical statutory vacancy
   allowance. Since June 14, 2019 there is no separate vacancy increase.

## Known limits

- **Building-level only.** DHCR and NYCDB data show that a building has registered stabilized
  units. They do not show that *your* apartment is one of them. Request your apartment's rent
  history from DHCR (REC-1) to confirm.
- **No MCI or IAI increases.** Major Capital Improvement and Individual Apartment Improvement
  increases can legally raise the rent above RGB alone. They are not modeled, so the estimate
  may overstate an overcharge in buildings that have them.
- **No vacancy allowances** beyond rows the tenant flags as pre-2019 vacancy leases, and no
  preferential-rent, high-rent-deregulation or other case-specific rules.
- **The first lease is assumed legal.** If the starting rent was itself an overcharge, the
  estimator can't detect it.
- Registration data lags 1–2 years, and some stabilized buildings (for example recent 421-a or
  J-51 buildings) may not appear at all.

## Run it locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # optional: add an LLM key for the complaint draft
npm run dev                  # http://localhost:3000
```

The built SQLite database (`data/app.db`) is committed, so lookups work right away. To rebuild
it from fresh NYCDB CSVs, follow [`data/README.md`](data/README.md) and run `npm run seed`.

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (`node --test` over `tests/*.test.ts`) |
| `npm run lint` | ESLint |
| `npm run seed` | Rebuild `data/app.db` from `data/seed/` |
| `npm run feedback:contacts` | Print opt-in feedback contact emails (needs Upstash env vars) |

### Environment variables

All are optional. Lookups and overcharge estimates work with none set.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Drafts the RA-89 cover statement (preferred if set). |
| `ANTHROPIC_API_KEY` | Drafts the RA-89 cover statement (used if no OpenAI key is set). |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Enables cookieless [Umami](https://umami.is/) analytics. Unset = no analytics script. |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | Umami script URL; defaults to `https://cloud.umami.is/script.js`. Set this if you self-host. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis (free tier, via the Vercel Marketplace). Backs the rate limit, the daily AI cap and feedback contacts. `KV_REST_API_URL`/`KV_REST_API_TOKEN` also work. |
| `AI_DAILY_CAP` | Max AI drafting calls per New York day across all users. Default `200`. |
| `APP_DB_PATH` | Override the SQLite location (default `./data/app.db`). |

## Abuse and cost limits

- The AI drafting endpoint allows **5 drafts per IP per hour**. IPs are hashed before use and never stored raw.
- A global **daily cap** (`AI_DAILY_CAP`, default 200) stops all AI calls for the rest of the New York day once reached.
- Both counters live in Upstash Redis. Without it they fall back to per-instance memory, which is weaker on serverless.

## Privacy

Analytics are cookieless and count anonymous usage only. Events are `lookup_run`, `verdict_shown`,
`overcharge_calculated`, `ra89_draft_generated`, `language_changed`, `verdict_feedback` and
`draft_feedback`. The only properties ever sent are borough, verdict result, language and a yes/no. [`src/lib/analytics.ts`](src/lib/analytics.ts)
enforces this with an allowlist. Addresses, BBLs, unit numbers, rents and lease dates are never
sent to analytics, and addresses are never stored on the server. Form answers for the RA-89 are
saved only in your own browser (`localStorage`). If a tenant opts in to being contacted, only
their email, which prompt it came from and a timestamp are stored (in Upstash), never an address.

## License

[MIT](LICENSE)
