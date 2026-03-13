# Residential enrichment pipeline

This folder preserves the enrichment workflow supplied by the user so the production app can keep the original residential-only population path intact. The supplied scraper reads territory CSV files from `./data/territories/`, builds Cyber Background Checks URLs, applies Playwright stealth, rotates proxies, and writes `./data/enriched_territories.json`. The provided scraper targets the `Complete Address` column and appends enriched resident rows with name, phone, email, and checked-state metadata.

## Files
- `Residential Enrichment Scraper.py` — the original enrichment scraper supplied by the user.
- `push_to_supabase.py` — a companion push script that upserts territories and refreshes address rows in Supabase.

## Expected flow
1. Export master territory CSV files from the preserved territory engine.
2. Place each territory CSV inside `./data/territories/`.
3. Run the scraper to generate `./data/enriched_territories.json`.
4. Run `push_to_supabase.py` with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` configured.
5. The React app will consume the refreshed `territories` and `addresses` data.

## Important note
The preserved legacy territory-management engine already applies residential-only filtering when fetching candidate addresses from map boundaries, including explicit non-residential exclusion logic and a strict residential-ready status check. This enrichment pipeline should be treated as the secondary resident-data enrichment pass, not a replacement for the original residential filtering logic.
