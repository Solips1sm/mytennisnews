# MyTennisNews

A headless‑CMS‑first, one‑day MVP to launch a customizable tennis news magazine/newsletter at `mytennisnews.com`. Editorial content is managed in the CMS; the Next.js front‑end handles browsing, a simple subscribe capture, and a minimal ingestion pipeline writing drafts to the CMS with citations.

## Goals
- Deliver a deployable Day‑1 slice
- Provide a basic yet themeable UI (Tailwind + shadcn/ui)
- Enable a subscribe form that persists emails
- List and view articles from Sanity with canonical links
- Ingest one RSS source to create CMS drafts with citations

## Architecture
- Front‑end: Next.js 14 (App Router) + React 18 + TypeScript
- CMS: Sanity v3 (Studio + dataset) for `article`, `source`, `tag`
- UI: Tailwind CSS + shadcn/ui (dark/light)
- API/Auth: Day‑1 skip or minimal; add NextAuth later
- DB: PostgreSQL (Supabase) via Prisma for `Subscription` and `IngestedItem`
- Email: Resend later; stub adapter in place
- Search: later; optional client‑side filter
- Ingestion: `rss-parser` script creating CMS drafts with canonicalUrl/source
- Deploy: Vercel (app + optional Cron), Supabase (DB), Sanity (Studio)

## Repository Layout (target)
- `app/(public)/` — listing, article detail, subscribe
- `app/api/subscribe/route.ts` — store email
- `cms/` — Sanity Studio + schemas
- `lib/` — CMS client, zod schemas, integrations
- `prisma/` — `schema.prisma`, `migrations/`
- `scripts/ingest-feeds.ts` — single-source ingestion

## Content Model
In Sanity:
- `article`: title, slug, excerpt, body (first‑party only), canonicalUrl, source (ref), tags[], status, publishedAt
- `source`: name, url, feedUrl, license, allowedUse
- `tag`: name, slug

In Postgres (Day‑1):
- Subscription(id, email, status, verifiedAt)
- IngestedItem(id, sourceKey, externalId/hash, raw, normalized, status, createdAt)

## Setup
1) Install deps
```pwsh
pnpm install
# or
npm install
```

2) Environment
- Create `.env` from `.env.example` and fill: `DATABASE_URL`, `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_READ_TOKEN`, `SANITY_API_WRITE_TOKEN`
- Leave `NEXT_PUBLIC_PREVIEW_MODE=false` in production; rely on `/api/preview` only when an editor explicitly enables preview.
- Keep `DRY_RUN=true` and the ingestion debug flags off by default. Flip them per-command when you need destructive behaviour (for example, `DRY_RUN=false npm run cleanup:drafts`).

3) DB migrate
```pwsh
npx prisma migrate dev --name init
```

4) Sanity Studio
Use the integrated Studio under `cms/` (Sanity v3):
```pwsh
# set env first
$env:SANITY_PROJECT_ID = "<your_project_id>"; $env:SANITY_DATASET = "production"

# start studio (dev)
npm run studio:dev

# or build static studio
npm run studio:build
```
If you prefer the CLI scaffold, output into `cms/` (to match this repo):
```pwsh
npm create sanity@latest -- --project <your_project_id> --dataset production --template clean --typescript --output-path cms
```
Then ensure schemas for `article`, `source`, `tag` are present (already added in `cms/schemas/`).

5) Dev server
```pwsh
pnpm dev
```

## Production configuration checklist

### Sanity (content store)
- **Dataset:** Use a dedicated `production` dataset. Keep any experimental data in a separate `staging` dataset.
- **API tokens:**
	- Create a "Editor" (write) token for ingestion/cron scripts → map to `SANITY_API_WRITE_TOKEN`.
	- Create a "Viewer" token for Next.js preview routes → map to `SANITY_API_READ_TOKEN`.
	- Store both as server-side secrets (Vercel Production env). Never copy them into `cms/.env`.
- **CORS / Allowed origins:** Add `https://mytennisnews.com`, `https://www.mytennisnews.com`, and the Vercel preview domains under *Settings → API → CORS Origins*.
- **Studio deployment:**
	- Either run Sanity Studio as part of the repo (`npm run studio:build` + deploy) or host it on Sanity’s managed studio. The `cms/` folder is already scaffolded.
	- Remove any local-only overrides (dev server host/port) before deploying the Studio.
- **Preview + publishing rules:**
	- Published articles live in Sanity and surface through the `*_PUBLISHED` GROQ queries; draft content only appears when preview mode is explicitly enabled.
	- Make sure editors double-check the `publishedAt` field—queries filter on it for digests and pagination.

### Supabase / Postgres (non-content data)
- **Project:** Create a Supabase project (or managed Postgres instance). Copy the pooled connection string (`?pgbouncer=true`) into `DATABASE_URL` for serverless-friendly connections. Keep `DIRECT_URL` (if used) for migrations only.
- **Prisma migrations:**
	```pwsh
	npx prisma migrate deploy
	```
	Run after each schema change; commit migrations so production stays in lockstep.
- **Connection settings:**
	- If you enable PgBouncer, set `PGSSLMODE=require` / `sslmode=require`.
	- Restrict database user permissions to the `Subscription` and `IngestedItem` tables.
- **Row Level Security (optional):** Enable RLS and add policies if you later expose Supabase directly.
- **Secrets:** Store DB credentials only in Vercel’s Production env (`DATABASE_URL`).

### Application toggles & housekeeping
- `NEXT_PUBLIC_APP_URL` → set to `https://mytennisnews.com` in Production.
- `NEXT_PUBLIC_PREVIEW_MODE` → keep `false`; preview mode is entered via `/api/preview` when needed.
- `DRY_RUN` → leave `true` globally; set to `false` only for one-off destructive scripts (`cleanup:drafts`, `purge:ledger`).
- `INGEST_DEBUG`, `INGEST_DEBUG_SAVE_HTML` → keep `false` in Production; enable temporarily when troubleshooting extractor output locally.
- `OPENAI_API_KEY`, `RESEND_API_KEY`, and other provider secrets → store in Vercel env, never in the repo.
- Ensure Vercel Cron (or your chosen scheduler) runs with the Production env vars so ingestion, AI backfill, and publishing use the right dataset and database.

### Data exposure guardrails
- Public site and API handlers already switch to published-only GROQ queries whenever preview mode is disabled, so no drafts leak to end users.
- `lib/digest.ts` and `scripts/send-digest.ts` use `ARTICLES_LIST_PUBLISHED`; weekly/daily digests only include published articles. Leaving preview off in Production protects this path automatically.
- If you add new queries or API routes, prefer the `*_PUBLISHED` variants and pass `perspective: "published"` (or avoid `drafts` altogether) unless explicitly building editorial tooling.

## Add & Preview Articles
- Add content: Open Sanity Studio (`cms/`) and create an `article`.
	- For external items, set `canonicalUrl` and `source`. Keep body short or leave empty unless licensed.
	- Drafts are saved automatically.
- Preview drafts: enable preview mode and use the site routes.
	```pwsh
	# Option A (env toggle during dev)
	$env:NEXT_PUBLIC_PREVIEW_MODE = 'true'; pnpm dev

	# Option B (route toggle)
	# Visit /api/preview?enable=true in the browser (disables with enable=false)
	```
	The app uses a preview-capable Sanity client so drafts are visible on the list and detail pages.

## Day‑1 Acceptance Criteria
- Article list and detail pages fetch from Sanity
- Subscribe form posts to API and stores to `Subscription`
- Ingestion script ingests one RSS source and creates CMS drafts with canonical link and source metadata
- Deployed on Vercel with env vars configured; Sanity Studio deployed

## Stretch Goals
- Add NextAuth (single provider) and a basic protected admin route
- Styling polish with shadcn/ui; simple client‑side search/filter

## Compliance
- Respect robots.txt/ToS; only allowed feeds/APIs
- Always display canonical link and source attribution
- Keep summaries short and non‑verbatim; never full‑text republish without license

## 3‑Day, Per‑Hour Plan

Day 1 — Core slice (8–12h)
- 0:00–0:30 Repo/project setup, ESLint/Prettier, `.env.example`
- 0:30–1:30 Next.js 14 + Tailwind + shadcn/ui; base layout
- 1:30–2:30 Sanity Studio init + schemas (`article`, `source`, `tag`)
- 2:30–3:00 Sanity tokens + CMS client wiring
- 3:00–4:30 Listing page (server component) from CMS with tags/canonical
- 4:30–5:30 Article detail page
- 5:30–6:30 Prisma: `Subscription`, `IngestedItem`; `POST /api/subscribe`; subscribe form
- 6:30–7:30 Integrations skeleton + RSS provider; `scripts/ingest-feeds.ts` with URL/hash dedupe
	- Run locally:
		```pwsh
		# optional: set alternative feed
		$env:FEED_NAME = "ESPN Tennis"; $env:FEED_URL = "https://www.espn.com/espn/rss/tennis/news"
		npm run ingest
		```
		The script dedupes by URL hash into `IngestedItem` and creates Sanity drafts with `canonicalUrl` and `source` reference. Respect robots.txt/ToS and attribution.
- 7:30–8:30 Deploy to Vercel; seed CMS docs; optional Vercel Cron

Day 2 — Comments, UX (6–8h)
- 1:30–2:30 `Comment` model + moderation scaffold
- 2:30–3:30 Client‑side tag filter/search; basic pagination
- 3:30–4:30 Error/empty/loading states; a11y checks
- 4:30–5:30 Resend adapter stub; optional double opt‑in endpoint (flagged)
- 5:30–6:30 Enable Cron for ingestion; add logging/observability

Day 3 — Adapters, digest, tests (6–8h)
- 0:00–1:30 Search adapter abstraction (PG FTS fallback); simple search endpoint
- 1:30–2:30 Analytics adapter (Plausible) via provider config
- 2:30–3:30 Weekly digest script + email template; send to test list
- 3:30–4:30 Unit tests for integrations; Playwright smoke flow
- 4:30–6:00 Perf (cache/revalidate), compliance review, production checklist

Milestones
- Day 1: Live list/detail, subscribe capture, single-source ingestion script
- Day 2: Auth + comments/moderation; UX polish; optional double opt‑in stub
- Day 3: Search/analytics adapters; digest; tests; perf passes

## Ingestion

Run a one-off ingest from the default ESPN Tennis RSS:

```pwsh
npm run ingest
```

Override with a different feed via env:

```pwsh
$env:FEED_NAME = "ATP"; $env:FEED_URL = "https://www.atptour.com/en/media/rss-feed/xml-feed"; npm run ingest
```

Multi-feed support (comma-separated `NAME|TYPE|URL`; TYPE defaults to `rss`):

```pwsh
$env:FEEDS = "ESPN Tennis|rss|https://www.espn.com/espn/rss/tennis/news, ATP|rss|https://www.atptour.com/en/media/rss-feed/xml-feed"; npm run ingest
```

Optional enrichment: fetch canonical article pages to extract main content and images (stored only in the DB ingestion ledger; CMS drafts include just title, excerpt, canonical URL, and source reference):

```pwsh
$env:INGEST_FETCH_ARTICLE = "true"; npm run ingest
```

For sources that hide content behind client-side rendering, enable the rendered fetch fallback. Allow specific hosts or flip the global switch, and choose the driver (`puppeteer` default or `real-browser` for Cloudflare-heavy pages):

```pwsh
$env:INGEST_RENDERED = 'true'                      # enable for all domains
$env:INGEST_RENDERED_HOSTS = 'espn.com,wta.com'     # or allowlist specific hosts
$env:INGEST_RENDERED_DRIVER = 'real-browser'       # use puppeteer-real-browser session
$env:INGEST_REAL_BROWSER_HEADLESS = 'shell'        # shell | true | false
$env:INGEST_REAL_BROWSER_CHROME_PATH = 'C:/chrome/chrome.exe'  # optional
```

If the real-browser driver fails to extract HTML (e.g. no headless Chrome available), the code automatically falls back to standard Puppeteer.

Legal/compliance: respect robots.txt/ToS and only store short excerpts in CMS. Use the allowlist to limit domains for extraction:

```pwsh
$env:INGEST_ALLOWED_DOMAINS = "espn.com,atptour.com"
```

Write body content to CMS (opt-in, compliance-aware):

```pwsh
# Do not write body (default)
$env:INGEST_WRITE_BODY = "none"

# Write a short summary to CMS body (adds disclaimer + canonical link)
$env:INGEST_FETCH_ARTICLE = "true"
$env:INGEST_WRITE_BODY = "summary"
$env:INGEST_BODY_MAX_CHARS = "1200"
npm run ingest

# Write full extracted text to CMS body (ONLY if you have permission)
$env:INGEST_FETCH_ARTICLE = "true"
$env:INGEST_WRITE_BODY = "full"
npm run ingest
```

Refresh mode: update existing items/drafts instead of skipping (useful after improving extractors or changing body-write settings):

```pwsh
# Re-extract and patch drafts for already-ingested items
$env:INGEST_REFRESH = "true"
$env:INGEST_FETCH_ARTICLE = "true"
$env:INGEST_ALLOWED_DOMAINS = "espn.com"
$env:INGEST_WRITE_BODY = "summary"   # or "full" if permitted
$env:INGEST_BODY_MAX_CHARS = "1200"
npm run ingest
```

If you need to force a clean re-run, you can purge the ingestion ledger for a given source key (then rerun ingest without refresh):

```pwsh
$env:SOURCE_KEY = "rss:https://www.espn.com/espn/rss/tennis/news"; npm run purge:ledger
$env:DRY_RUN = "false"; npm run purge:ledger
```

## Cleanup Drafts

Delete draft articles created by ingestion (safe, with dry-run and confirmation):

```pwsh
# List candidate drafts (dry run)
npm run cleanup:drafts

# Delete drafts older than a date (requires confirmation)
$env:DRY_RUN = "false"; $env:CLEANUP_OLDER_THAN = "2025-09-01T00:00:00.000Z"; npm run cleanup:drafts

# Filter by tag name (if your schema links tags)
$env:DRY_RUN = "false"; $env:CLEANUP_TAG = "ESPN"; npm run cleanup:drafts
```

Alternatively, delete drafts directly in Sanity Studio from the Documents pane.

Need to purge Cloudflare "Just a moment" artifacts that slipped into drafts or published entries? Run the specialised cleanup script (dry-run by default):

```pwsh
# list affected drafts/published docs containing Cloudflare challenge HTML
npm run cleanup:cloudflare

# apply deletions (requires DRY_RUN=false); optionally include published docs
$env:DRY_RUN = 'false'; npm run cleanup:cloudflare -- --include-published
# to delete published docs outright instead of scrubbing them, add --delete-published
```

The script also clears matching entries in the Prisma ingestion ledger so future runs can re-ingest the cleaned URLs.

## Production Cron Workflow

For a dedicated production worker, use the bundled cycle script or the hosted API route to orchestrate ingestion, AI generation, and publishing:

```pwsh
npm run cron:cycle
```

Hosted endpoint (guarded by `CRON_SECRET`): `POST https://<your-domain>/api/cron-cycle`

Each run performs three phases:

1. **Ingest feeds**: executes the configured presets, deduplicating against the Prisma ingestion ledger so only new items are parsed.
2. **AI backfill**: runs the OpenAI pipeline for articles missing `aiFinal.body`, applying source-aware variant counts (ATP/WTA → 3 variants, ESPN → 4, default → 5).
3. **Auto-publish**: copies drafts with populated AI bodies into published Sanity documents and sets their `status` to `published`.

Environment toggles:

- `CRON_SECRET` — required when calling `/api/cron-cycle` (send as `Authorization: Bearer <CRON_SECRET>` or `?secret=` query string).
- `CRON_FEEDS` — comma-separated preset keys (default `espn,atp,wta`).
- `CRON_AI_CONCURRENCY` — max concurrent AI generations (default `2`).
- Standard Sanity tokens and `OPENAI_API_KEY` must be available in the environment.

Example crontab entry (every 30 minutes):

```cron
*/30 * * * * cd /srv/mytennisnews && /usr/bin/env NODE_ENV=production npm run cron:cycle >> /var/log/mytennisnews-cron.log 2>&1
```

Example Vercel Scheduled Function (every 30 minutes):

```json
{
	"schedule": "*/30 * * * *",
	"endpoint": "https://<your-domain>/api/cron-cycle",
	"headers": {
		"Authorization": "Bearer <CRON_SECRET>"
	}
}
```

The public site already uses the `*_PUBLISHED` GROQ queries whenever `NEXT_PUBLIC_PREVIEW_MODE` is false, so only published articles surface in production.

### Tagged RSS Provider & Multiple Feed Types

You can now supply feeds with a `TYPE` of `rss` (default) or `rss-tags`. The `rss-tags` provider captures `<category>` values from the RSS items and maps them to `NormalizedItem.tags`, which you can later use to auto‑assign or suggest Sanity tags (a future enhancement — currently stored only in the ingestion ledger / runtime object).

Example mixing standard and tagged feeds:

```pwsh
$env:FEEDS = "ESPN Tennis|rss|https://www.espn.com/espn/rss/tennis/news, ATP News|rss-tags|https://www.atptour.com/en/media/rss-feed/xml-feed"; npm run ingest
```

If the `TYPE` segment is omitted it defaults to `rss`.

### Domain-Specific Extractors (ATP + ESPN)

Custom extractors run before the generic fallback:
- `espn.com` → rich extraction (body, images, videos, timestamps)
- `atptour.com` → ATP‑specific parsing for cleaner body, byline, credits

Enable extraction (and optionally body write):

```pwsh
$env:INGEST_ALLOWED_DOMAINS = "espn.com,atptour.com"
$env:INGEST_FETCH_ARTICLE = 'true'
npm run ingest
```

Add summaries (disclaimer + canonical):
```pwsh
$env:INGEST_WRITE_BODY = 'summary'
$env:INGEST_BODY_MAX_CHARS = '1200'
npm run ingest
```

Full body (only with proper rights):
```pwsh
$env:INGEST_WRITE_BODY = 'full'
npm run ingest
```

Refresh after improving extractors:
```pwsh
$env:INGEST_REFRESH = 'true'
$env:INGEST_FETCH_ARTICLE = 'true'
npm run ingest
```

Future idea: map `NormalizedItem.tags` (from `rss-tags`) to existing Sanity `tag` documents by slug/name and attach references automatically in the draft creation step with an allowlist to prevent tag spam.

### ATP-Specific RSS (`atp-rss`)

Use the `atp-rss` type for feeds from `atptour.com` to apply ATP‑specific cleaning:
- Strips placeholders like `[NEWSLETTER FORM]`, `[ATP APP]`
- Normalizes relative asset URLs (images `/-/media/...` → absolute)
- Converts categories to `tags`
- Produces a trimmed plain‑text excerpt from rich HTML (including schedule blocks, etc.)
- Still runs domain extractor (enhanced) if `INGEST_FETCH_ARTICLE=true`

Example multi-feed with ATP:
```pwsh
$env:FEEDS = "ESPN Tennis|rss|https://www.espn.com/espn/rss/tennis/news, ATP Official|atp-rss|https://www.atptour.com/en/media/rss-feed/xml-feed"; npm run ingest
```

To allow extraction:
```pwsh
$env:INGEST_ALLOWED_DOMAINS = "espn.com,atptour.com"
$env:INGEST_FETCH_ARTICLE = 'true'; npm run ingest
```

## AI Content Pipeline (Synchronous Chain of Experts)

This repo includes a synchronous AI pipeline that:

- Selects a source article (via Sanity ID).
- Generates source-aware expert variants with advanced tennis analysis and precise terminology (ATP/WTA → 3 variants, ESPN → 4, default → 5).
- Dynamically enforces a minimum length: source text length + 200 characters (with a safety floor). If the draft is short, it runs iterative expansion passes.
- Synthesizes a final draft from the 5 variants, also enforcing the dynamic min-length with iterative expansion.
- Patches the Sanity draft with `aiVariants[]` and `aiFinal`, then sets `status` to `review`.

### Run the pipeline

Prereqs: `OPENAI_API_KEY`, Sanity env vars.

```pwsh
# Optional: ingest first to create drafts
npm run ingest

# Run AI pipeline for a draft/article by Sanity _id
tsx scripts/ai-pipeline.ts <sanity-article-id>
```

### Fields used in Sanity

- `aiVariants[]`: array of {title, excerpt, body}
- `aiFinal`: {title, excerpt, body, provider, model, createdAt}

### Prompt and length strategy

- Base length derived from source bodyText (or excerpt/title as fallback).
- Minimum target = base + 200 characters, with a reasonable floor.
- Up to 3 expansion passes if a draft is too short, focusing on tactics (serve+1, rally tolerance, H2H, surfaces, rankings/Elo) and clarity.

## Long-term Plan (20+ Steps)

Day 1-2: Pipeline foundation
- Provider interface and OpenAI implementation
- Sanity fields for `aiVariants` and `aiFinal`
- Synchronous script (5 variants → final) with dynamic min-length and expansion
- Logging and error handling

Day 3: Editorial UX
- Studio desk panes for AI fields; review workflow
- Diff view and quick regenerate for any single variant

Day 4: Sources & Fidelity
- More providers; robots/ToS checks; richer context extraction

Day 5: Media UX
- Preserve source images/videos by URL; consistent captions/credits; fullscreen UX

Day 6: Benchmarks
- Metrics: generation time, tokens, acceptance rate
- Golden set for regression

Day 7-8: Quality
- Prompt tuning for nomenclature and structure
- Hallucination guardrails; red-team tests

Day 9: Observability
- Structured logs, tracing, retries

Day 10: Storage & Audit
- Persist pipeline metadata in Prisma; reviewer notes

Day 11: Scheduling
- Vercel Cron pipelines; admin trigger route

Day 12: Search & Tags
- Entity extraction for players/tournaments; search boosts

Day 13: A/B Prompts
- Compare styles; measure editor acceptance and dwell time

Day 14: Perf & Cost
- Cache partial results; cap expansions; token budgets

Day 15: Compliance
- Automated checks for attribution and licensing

Day 16: Publishing
- Optional auto-publish rules under thresholds

Day 17: Multi-model
- Pluggable providers and routing

Day 18: Editor polish
- Inline paraphrase; paragraph-level regeneration

Day 19: Notifications
- Slack/Email when drafts are ready

Day 20: Runbooks
- Ops docs, incident handling, prompt change process
