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
Screens: Overview, Replenishment, Ads budget, Promotions, Market segment share, Data freshness, AI agents (Weekly review, Ask BOOST), Admin Upload center, Admin Ingestion log.

## Architecture
- Next.js 15 App Router, React 19, TypeScript, plain CSS tokens (`app/globals.css`). Only runtime deps: next, react, react-dom, pg. No Anthropic SDK: Claude is called with `fetch` (`lib/analyze.ts`).
- Postgres access via `pg` and `DATABASE_URL` (`lib/db.ts`, lazy pool of 6 connections, 30s wait, SSL). No Supabase Auth, no service role.
- Auth: HMAC-signed cookie `boost_session` (`lib/auth.ts`). Roles: `admin` (password in `ADMIN_PASSWORD`) and `brand` (one-click read-only demo). Every page calls `requireSession()` / `requireAdmin()` itself because layouts do not protect pages.
- Env vars: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). See `.env.example`.
- Metrics are computed in code (`lib/metrics.ts`, SQL in `lib/queries.ts`); Claude only interprets them (JSON: headline, actions, watch). Results are cached by data hash in `analysis_cache`.
- AI agents (`lib/agent/`): one tool-use loop (`engine.ts`) with read-only tools (`tools.ts`: the five screens' figures for any period, plus `get_product_view` joining sales, ads, stock status, promotions and lost demand per platform and product, used to find conflicts between screens). Each HTTP request runs turns within a ~22s budget (Vercel stops at 60s); the browser continues with the HMAC-signed state. Claude's full replies are passed back unchanged.
  - Weekly review (`/review`, `app/api/agent/review`): admin runs it; the agent reads every screen for the latest week vs previous week and vs last year, then calls `submit_brief` (strict schema). The brief is saved in `analysis_cache` (module `weekly_review`) and shown to everyone. The run lives in `components/ReviewProvider.tsx` (app layout), like Ask BOOST, so it keeps going on other pages and resumes after a reload.
  - Ask BOOST (`/ask`, `app/api/agent/ask`): questions in plain English, follow-ups keep the conversation. Demo visitors: 5 questions per session (signed cookie `boost_asks`) and 50 per day in total (rows in `analysis_cache`, module `ask_log`). The conversation and its request loop live in `components/AskProvider.tsx`, mounted in the app layout, so an answer keeps running while the user opens other pages (sidebar badge: working / new); it is also kept in sessionStorage (per role) so a reload resumes the run.
- Period picker (`lib/period.ts`, `components/PeriodPicker.tsx`): every dashboard and the Claude analysis work on a week (Mon to Sun), month, quarter, year to date, custom date range or the full period, chosen in the URL (`?view=week&p=2026-10-19`, `month&p=2026-10`, `quarter&p=2026-Q3`, `ytd`, `custom&from=..&to=..`, `year`), compared with the previous period (default) or the same period last year (`&cmp=yoy`: week = 364 days earlier, month/quarter = same one last year, YTD/custom = same dates last year; PP for YTD/custom = same number of days just before). Partial periods compare like for like. Default is the latest week. Replenishment shows stock on the last day of the period. Only the admin can force a fresh Claude call.

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
Output goes to `datapack/out/` (git-ignored): 5 platforms x 6 feeds x 2 periods = 60 files plus Brand Master plus guide = 62 xlsx files, 302,005 data rows (104 weeks, two years so YoY works).
- Backfill: 28 Oct 2024 to 18 Oct 2026. Weekly update: 19 to 25 Oct 2026.
- The scripted storylines sit in the last 14 weeks (`ANCHOR` = 20 Jul 2026 in `simulate.py`); growth, market share and stock overrides are anchored there. Growth before 27 Oct 2025 (`YEAR2`) runs at half pace. Both years have seasonality (Ramadan, both Eids, Yellow/White Friday, Prime Day, summer); dated events repeat in the first year (`add_prior_year`), and list prices rose in Feb 2025, Mar 2026 and Sep 2026.
- `build_templates.py` writes blank upload templates with a How to use tab.
- Regenerate: `cd datapack && python3 build_pack.py` (then `python3 export_spec.py` if the spec changed).
- Place the pack at `datapack/out/Sprout_Baby_Care_Data_Pack/` (the zip the owner already has). The test scripts read it from there.

## Verified numbers (sanity checks; the in-memory model test must match)
Full period (28 Oct 2024 to 25 Oct 2026): net sales EGP 60,160,515; ad spend 6,093,272; lost demand 1,274,118 (2.1%). Promo: 27 promotions, 1,326 runs, dilutive -268,510, accretive +558,614. On 25 Oct 2026: Talabat Cairo East 4.5 days and Giza 2.2 days of cover at risk (Water Wipes 2x60); Amazon Core aloe overstock (open PO 2,400). Talabat ad spend on suppressed listings 6,080. Latest week (19 to 25 Oct 2026): net sales 783,876 vs 783,147 the week before and 518,260 the same week last year. YTD 2026: 29,846,614 vs YTD 2025 21,156,961. Q3 2026: 10,352,855 vs Q3 2025 7,077,107.

## Status
Live at https://boost-app-v8js.vercel.app (Vercel, region fra1). Done: build, tests, deploy, uploads, Claude analysis, platform wording, info icons on every KPI, readable chart labels, two-year pack with week/month/quarter/YTD/custom/full-period picker and previous-period or year-on-year comparison.
Capstone deadline moved to 30 Oct 2026.

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
- Promo effect: each run of a promotion (consecutive promo days per SKU) is compared with that SKU's non-promo days in the 14 days before it (at least 5), after platform margin, cost of goods and brand-funded discount. Runs overlapping the period count in full.
- Ads: ROAS = attributed 7-day sales / ad spend, ex VAT, compared with each campaign's target ROAS.
