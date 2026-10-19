# Seed data sources

`scripts/seed.ts` reads the files in `data/seed/` and writes them to `data/app.db` (SQLite).

## Files

| File | Size | Source | Refresh |
|---|---|---|---|
| `rgb_orders.json` | small | Hand-keyed from the [official RGB Apartment Orders chart](https://rentguidelinesboard.cityofnewyork.us/wp-content/uploads/2025/07/RGB-Apartment-Chart.pdf) (Orders #1–#58) | Annually after the new RGB order is adopted (typically June/July) |
| `rentstab.csv` | 9.3 MB | NYCDB `rentstab` dataset — `https://taxbillsnyc.s3.amazonaws.com/joined.csv` | Quarterly-ish; this dataset covers 2007–2017 unit counts plus PLUTO joins (address, owner, lat/lng, etc.) |
| `rentstab_v2.csv` | 24 MB | NYCDB `rentstab_v2` dataset — `https://s3.amazonaws.com/justfix-data/rentstab_counts_from_doffer_2024.csv` | Annually after JustFix's `nyc-doffer` re-runs; covers 2018–2024 unit counts |

## Refresh commands

The two CSVs are gitignored. Re-download with:

```bash
curl -fsSL https://taxbillsnyc.s3.amazonaws.com/joined.csv -o data/seed/rentstab.csv
curl -fsSL https://s3.amazonaws.com/justfix-data/rentstab_counts_from_doffer_2024.csv -o data/seed/rentstab_v2.csv
```

Then `npm run seed` to rebuild `data/app.db`.

## Snapshot info

These notes track when the local CSVs were last refreshed.

- `rentstab.csv`: snapshot fetched on first seed run.
- `rentstab_v2.csv`: snapshot fetched on first seed run; covers `uc2018` through `uc2024`.

## Notes on the data

- `rentstab.csv` boolean columns are `Y` / `N` / empty in the CSV (the upstream schema declares them `boolean` after import to Postgres).
- The `dhcr` flag for a year means the BBL appeared on DHCR's published rent-stabilized-buildings list that year. DHCR registration is voluntary, so the list is incomplete; cross-check with the unit count column for the same year.
- The unit count columns (`{year}uc`) come from scraping NYC DOF tax bill PDFs — see [JustFixNYC/nyc-doffer](https://github.com/JustFixNYC/nyc-doffer) for the upstream pipeline.
- `rentstab_v2.csv` does not include addresses or owner names. Buildings present only in `v2` (and not in `rentstab.csv`) are skipped by the seed unless we later add a PLUTO join.
