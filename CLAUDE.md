# BOOST (placeholder name) - project brief for Claude Code

## What this is
Course capstone for the Claude course (Digital Commerce Accelerator context), due about 24 Oct 2026 (check with owner, may have moved).
A Supabase-backed Next.js web app, deployed on Vercel from this repo (`ehabmontasser/Boost-app`). It consolidates e-commerce and quick-commerce platform data into readable dashboards, each with a button that asks Claude for ranked actions.
Dummy brand: Sprout Baby Care. All data is synthetic with scripted storylines; say so in the demo.
Owner: Ehab (FMCG commercial professional, Cairo, UTC+3). He is not a developer: guide him step by step, explain in plain English.

Deliverables: (1) published working MVP link, (2) 1-3 minute walkthrough video. The course requires the build to be shown in Claude Code.

## Working rules (from the owner)
- English only. Direct and analytical. Push back once if you disagree, then follow his lead.
- No emojis, no em dashes.
- Do not create extra files, docs, decks or sheets unless asked.
- Priority one: the app works with no errors. Keep code conservative.
- Commit messages end with the attribution lines Claude Code gives you.

## Security rules (do not break)
- The owner pastes secrets into Vercel himself. Never ask him to paste the Anthropic key, DB password or service_role key into chat. Never print or commit them.
- Never use or ask for the Supabase `service_role` key. The app uses `DATABASE_URL` (transaction pooler) via `pg`.
- Do not touch the Supabase projects "Football Heroes 2026" or "Personal-Portfolio". Only `boost-demo` (id `ivdxroonngwpkdhmnjyx`, eu-central-1).
- Set a spend cap on the Anthropic API key.

## Scope
Channels: Talabat Mart, Noon, Amazon Core (e-commerce), Amazon Now (quick commerce), Breadfast. Rabbit is pending (status awaiting_data). Jumia dropped.
Amazon Core and Amazon Now are two separate platforms (codes AMAZON and AMAZON_NOW). Shelf capacity is ignored in the database.
Four decision modules: Stock replenishment; Ads budget; Promotions and discounts; Market Segment Share (formerly "Must Stock list").
Screens: Overview, Replenishment, Ads budget, Promotions, Market segment share, Data freshness, Admin Upload center, Admin Ingestion log.

## Architecture
- Next.js 15 App Router, React 19, TypeScript, plain CSS tokens (`app/globals.css`). Only runtime deps: next, react, react-dom, pg. No Anthropic SDK: Claude is called with `fetch` (`lib/analyze.ts`).
- Postgres access via `pg` and `DATABASE_URL` (`lib/db.ts`, lazy pool, SSL). No Supabase Auth, no service role.
- Auth: HMAC-signed cookie `boost_session` (`lib/auth.ts`). Roles: `admin` (password in `ADMIN_PASSWORD`) and `brand` (one-click read-only demo). Every page calls `requireSession()` / `requireAdmin()` itself because layouts do not protect pages.
- Env vars: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). See `.env.example`.
- Metrics are computed in code (`lib/metrics.ts`, SQL in `lib/queries.ts`); Claude only interprets them (JSON: headline, actions, watch). Results are cached by data hash in `analysis_cache`.

### Data flow
Excel files (BOOST data-sharing standard v1.0) -> `lib/xlsx.ts` (dependency-free reader) -> `lib/validate.ts` (rules driven by `lib/spec.json`) -> `lib/mapping.ts` (file columns to DB columns, platform name to code) -> `lib/importer.ts` (upsert by key in 1,000-row chunks inside a transaction) -> `app/api/upload/route.ts`.
- Six feeds per platform: SALES, INVENTORY, PRICE_PROMO, ADS (daily), MARKET, SERVICE (weekly). MARKET has two tabs.
- Each file has Meta (template_id `BOOST-{FEED}-v1.0`, platform, period_start, period_end), Guide and Data tabs. The bulk upload routes files by the Meta tab.
- `SETUP_00_BRAND_MASTER_v1.xlsx` must be loaded first (creates the brand, SKUs, listings, nodes, params, terms, competitors). Other files are rejected until it exists.
- Unknown platform SKU ids are accepted with a warning and queued in `sku_mapping_queue`.
- Re-uploading a file replaces rows by key, so repeats are safe.
- DB platform codes: TALABAT, NOON, AMAZON, AMAZON_NOW, BREADFAST, RABBIT. DB column names differ from file names (e.g. `net_gmv_ex_vat_egp` becomes `net_gmv`); see `lib/mapping.ts`.
- DDL through the Supabase MCP tools was repeatedly cancelled; the schema already exists. Avoid schema changes.

## Data pack (`datapack/`)
Python generator for the synthetic pack: `simulate.py` (engine), `spec.py` (standard), `storylines.py`, `build_pack.py`, `validate_pack.py`, `business_numbers.py`, `export_spec.py` (writes `lib/spec.json`).
Output goes to `datapack/out/` (git-ignored): 5 platforms x 6 feeds x 2 periods = 60 files plus Brand Master plus guide = 62 xlsx files, 37,741 data rows.
- Backfill: 20 Jul to 11 Oct 2026. Weekly update: 12 to 18 Oct 2026.
- Regenerate: `cd datapack && python3 build_pack.py` (then `python3 export_spec.py` if the spec changed).
- Place the pack at `datapack/out/Sprout_Baby_Care_Data_Pack/` (the zip the owner already has). The test scripts read it from there.

## Verified numbers (sanity checks; the in-memory model test must match)
Net sales EGP 10,444,011; ad spend 761,486; lost demand 222,892 (2.1%). Promo: dilutive -65,483, accretive +50,985. Talabat Cairo East 3.1 days and Giza 4.2 days of cover at risk. Amazon Core aloe 263 days of cover (overstock). Talabat ad spend on suppressed listings 6,177.

## Status
Done: data pack, importer and validator (tested on all 61 files, 0 blocking errors), module models (match the Python numbers), all pages and routes written, design approved, code pushed.
NOT done: the Next.js layer has never been compiled or run. The build sandbox could not reach npm. First job in Claude Code is the first real build.

## First steps in Claude Code
1. `npm install`
2. `npm run typecheck` then `npm run build`. Fix every error and warning.
3. `npm run selftest` and `npm run modeltest` (need the pack in place). Results must match the numbers above.
4. Run `npm run dev` with a local `.env.local` (owner fills it) and click through every page as admin and as brand demo.
5. Deploy: Vercel imports this repo; owner adds the four env vars in Vercel settings; redeploy.
6. Guide the owner through uploads, in this order: Brand Master, then the 30 backfill files (select a channel folder at a time, files are sorted automatically), check Data freshness shows "through 11 Oct" everywhere, then the 30 weekly files.
7. Test the Claude analysis button on each module page.
8. Help record the 1-3 minute walkthrough: login, Overview, Replenishment, Ads, Promotions, Market share, Upload and freshness, one Claude analysis.

## Design (approved, files in `docs/design/`)
Open `docs/design/Main.dc.html` etc. in a browser for the mock screens.
- Ink #101923, Boost lime #C6F432 (on dark only), Signal blue #2354E8, Paper #F2F4F6, Line #DDE2E7.
- Status: Healthy #0B7A6B, Watch #A85A00, Risk #B3261E.
- Channels: Talabat #2354E8, Noon #101923, Amazon Core #E0762B, Amazon Now #8A4FD6, Breadfast #0B9E8A.
- Fonts: Space Grotesk (headings) and Inter (body). Dark 240px sidebar, cards with 14px radius.
- No DTRAC branding anywhere. Product name BOOST is a placeholder.

## Rules baked into the models
- Replenishment: at risk if gap days >= 1.5 and gap days x daily rate >= 10, where gap = (days to PO arrival, or lead time + review period if no PO) minus current cover. Overstock judged per platform and SKU against max cover days. Watch if cover is under 50% of target.
- Promo effect: compared with the 14 days before each promotion, after platform margin, cost of goods and brand-funded discount.
- Ads: ROAS = attributed 7-day sales / ad spend, ex VAT, compared with each campaign's target ROAS.
