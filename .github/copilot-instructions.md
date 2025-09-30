# GitHub Copilot Project Instructions — MyTennisNews (Headless CMS)

These instructions realign the MVP to a headless‑CMS‑first approach for `mytennisnews.com`, emphasizing extensibility via integrations (news sources, email, search, analytics) and editorial UX.

## Mission & Scope
- MVP in 1 day: production‑deployable slice that lists articles from CMS, shows article detail, supports basic subscribe capture, and an ingestion script that creates CMS drafts from one RSS source with citations. Keep the architecture ready to grow.
- Guardrails: respect source ToS/robots.txt; store and display canonical source links; no full‑text republishes without license; clear attribution.
- Optimize for maintainability, accessibility (WCAG AA), performance, and security.

## Platform Direction (Headless CMS)
- Preferred CMS: Sanity (v3) or Ghost (if you want built‑in newsletter). Default: Sanity + Next.js front‑end.
- Editorial: use CMS Studio for content entry, drafts, review workflows, and tagging.
- Front‑end: Next.js 14 (App Router) + server components; fetch content via Sanity client.
- Database: keep Postgres/Prisma for auth, comments, subscriptions, and ingestion ledger. Content (Articles, Tags, Sources) primarily lives in CMS; mirror minimal metadata in DB when needed for joins.

## Default Tech Stack (updated)
- Web: Next.js 14 + React 18 + TypeScript
- CMS: Sanity v3 (content schemas for Article, Source, Tag)
- UI: Tailwind CSS + shadcn/ui; dark/light theme via CSS vars
- Auth (Day‑1): defer or add a single provider (email magic link OR Google). Full NextAuth matrix is stretch.
- DB: PostgreSQL (Supabase) via Prisma for non‑content domain (subscriptions/ingestion now; comments/auth later)
- Email: Resend (transactional + newsletter) — adapter scaffold Day‑1; sending weekly digest is stretch
- Search: Postgres FTS later; simple client‑side filter Day‑1 if needed
- Ingestion: RSS/Atom (rss‑parser) with a manual script run; optional Vercel Cron wiring after Day‑1
- Caching/ratelimit: optional later
- Tests: smoke tests only Day‑1; Vitest/Playwright later
Deploy: Vercel (front‑end + optional CRON) + Supabase (DB) + Sanity v3 (Studio + dataset)
1:30–2:30 Init Sanity Studio (cms/) + dataset; add schemas (`article`, `source`, `tag`). Use `npm run studio:dev` or scaffold via `npm create sanity@latest -- --project <id> --dataset production --template clean --typescript --output-path cms`.
  - `lib/integrations/feeds/` (RSS/Atom, custom APIs)
  - `lib/integrations/email/` (Resend, Mailgun)
  - `lib/integrations/search/` (PG FTS, Algolia, Meilisearch)
  - `lib/integrations/analytics/` (Plausible, GA4)
- Config: `.env` toggles and `lib/config/integrations.ts` select active providers.
- Contracts: TypeScript interfaces; zod‑validated payloads; idempotent upserts.

Example feed provider interface
```ts
export interface FeedProvider {
  readonly name: string
  fetchNewItems(sinceIso?: string): Promise<NormalizedItem[]>
}
export type NormalizedItem = {
  externalId: string
  title: string
  url: string
  publishedAt?: string
  excerpt?: string
  source: { name: string; url: string; license?: string }
  tags?: string[]
}
```

## Content Model (CMS‑first)
In Sanity:
- `article`: title, slug, excerpt, body (for first‑party posts only), canonicalUrl (optional), source (ref), tags[], status, publishedAt
- `source`: name, url, feedUrl, license, allowedUse
- `tag`: name, slug

In Postgres (Prisma), for Day‑1 keep:
- Subscription(id, email, status, verifiedAt)
- IngestedItem(id, sourceKey, externalId/hash, raw, normalized, status, createdAt)

Later add:
- User, Comment, Reaction models

Notes
- Articles and tags live in CMS; subscriptions/ingestion ledger in DB.
- Use CMS `_id` or slug as stable identifiers.

## Folder Structure (target)
- `app/` (Next.js App Router)
  - `(public)/` — listing, article details, tags
  - `(admin)/` — admin pages (later)
  - `api/` — route handlers (subscribe, webhooks)
- `cms/` — Sanity Studio and schema definitions
- `lib/` — CMS client, integrations, zod schemas, utils
- `prisma/` — schema + migrations
- `scripts/` — ingestion job(s)
- `tests/` — basic smoke later

## Coding Conventions
- Server components by default; client where interactivity required.
- Fetch content via CMS in server components/route handlers.
- Validate boundaries with zod; sanitize user content.
- Accessibility first (WCAG AA), semantic HTML, focus rings.
- ESLint + Prettier; conventional commits.

## Security & Compliance
- Always render canonical source link and name for external articles.
- Respect robots.txt/ToS; fetch only allowed feeds/APIs.
- Summaries short and attributed; never republish full text without license.
- Secrets only in env; provide `.env.example`.

## Copilot Prompting Guidance
- Prefer CMS content reads/writes; avoid storing article bodies in DB.
- Ingestion (Day‑1): check allowance, dedupe by URL/hash, create CMS draft with `canonicalUrl`, `source`, short `excerpt`, and tags; never auto‑publish.
- UI: Tailwind + shadcn/ui, responsive, dark mode, accessible; keep components minimal for Day‑1.
- Integrations: define interface + one concrete adapter (one feed + email stub) selected via env.

## Day‑1 Acceptance Criteria
- Articles: list + detail pages pull from Sanity; external items show excerpt + canonical link; tags visible.
- Subscribe: simple form posts to API and stores email in `Subscription` (DB). Double opt‑in is optional (stretch).
- Ingestion: script ingests a single RSS source and creates CMS drafts with citations; no auto‑publish.
- Deploy: Vercel deployment with environment variables configured; Sanity Studio available.

Stretch (if time remains)
- Auth: single provider via NextAuth (email OR Google) and a basic protected admin route.
- Styling: add shadcn/ui polish; basic search/filter; lightweight analytics adapter.

## 3‑Day, Per‑Hour Implementation Plan

Day 1 — Core slice (8–12h)
- 0:00–0:30 Setup repo, linting, Prettier; add `.env.example`
- 0:30–1:30 Init Next.js 14 (App Router), Tailwind, shadcn/ui; base layout/theme
- 1:30–2:30 Init Sanity Studio (cms/) + dataset; add schemas (`article`, `source`, `tag`)
- 2:30–3:00 Generate Sanity tokens (read+write minimal); add CMS client
- 3:00–4:30 Build article listing page (server component) fetching from CMS; render tags and canonical
- 4:30–5:30 Build article detail page with external link and excerpt
- 5:30–6:30 Prisma init with `Subscription`, `IngestedItem`; route `POST /api/subscribe`; simple subscribe form
- 6:30–7:30 Ingestion skeleton: provider interface, RSS provider, `scripts/ingest-feeds.ts` (one source), dedupe by URL/hash
- 7:30–8:30 Deploy to Vercel, seed a few CMS docs; verify env wiring; optional CRON setup

Day 2 — Auth, moderation, polish (6–8h)
- 0:00–1:30 Add NextAuth single provider (email link OR Google); protected minimal admin route
- 1:30–2:30 Comment model (DB) + basic moderation queue (admin page scaffold)
- 2:30–3:30 Client‑side filter by tag/search; pagination on listing
- 3:30–4:30 Error boundaries, empty states, loading skeletons; a11y passes
- 4:30–5:30 Resend adapter stub + `.api` route for double opt‑in (flag off by default)
- 5:30–6:30 Vercel CRON enables ingestion; basic logging/observability

Day 3 — Full tech implementation (6–8h)
- 0:00–1:30 Search adapter abstraction (PG FTS fallback); simple search endpoint
- 1:30–2:30 Analytics adapter (Plausible) via provider config
- 2:30–3:30 Newsletter weekly digest script stub; template and send to test list
- 3:30–4:30 Add unit tests for integrations + smoke Playwright flow
- 4:30–6:00 Performance tuning (caching headers, revalidate), final compliance review, production checklist

Milestones by day
- Day 1: Live site with CMS-backed list/detail, subscribe capture, one-source ingestion script
- Day 2: Auth, basic comments/moderation, UX polish, optional double opt‑in stub
- Day 3: Search/analytics adapters, digest script, tests, perf hardening

## What Not to Generate
- Arbitrary scraping; full‑text republishes; secrets in code; long‑running processes beyond serverless limits.

## Open Questions
- Final CMS choice (Sanity default, Ghost alternative)?
- Initial sources and usage/licensing
- Email provider and domain setup (for production)
- Branding (palette, logo, type)
