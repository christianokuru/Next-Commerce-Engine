# Project memory — Next Commerce Engine

Read this first. It records what was built, why, and how the owner works. Keep it updated when things change.

## Who this is for (business context)

- Owner: a Nigerian developer in Lagos who builds and **sells e-commerce websites** to African and foreign clients.
- Model: **one-time payment per site** + optional monthly maintenance/hosting (₦30k–₦100k NG, $50–$300 foreign).
- Each client gets a **custom storefront**; this **engine + admin/customer dashboards stay the same** for every client.
- Tiers (Nigerian / foreign pricing, owner's estimates):
  - Starter ₦800k–1.2M / $3–5k — up to 50 products, guest checkout, Paystack/Flutterwave (Stripe abroad), order emails, basic admin.
  - **Standard ★ (recommended sweet spot)** ₦1.2–2M / $5–8k — unlimited products, customer accounts, **basic discount codes**, stock tracking, full admin.
  - Advanced ₦2–3M / $8–12k — multi-currency, delivery integration, reviews, analytics, advanced promotions.
  - Multi-vendor ₦2.5–5M+ / $12–25k+ — vendors, split payments, commissions, payouts (not built).
- Licensing: clients get a **limited, permanent licence** to the engine for their one store + plan (not ownership); they own their storefront code, data, domain and accounts. Templates: `docs/legal/LICENSE-TEMPLATE.md`, `docs/legal/PROPOSAL-CLAUSE.md` (internal; lawyer review pending).

## How the owner works (follow these)

- **Push to `main` always** when work is done (commit + push both repos as needed).
- Short, precise answers; save tokens; use MCP servers only when needed.
- Every site must be a **PWA and mobile-first**.
- Stack preference: Next.js, Tailwind, shadcn, Paystack, Flutterwave, Stripe; deploy on Cloudflare.
- Zero-config dev matters: `npm install && npm run dev` must just work (no env, embedded DB).
- Features outside a client's plan must be **hidden entirely** (not "locked"/upsold) — clients can see the code.
- Never put secrets in commits or chat. Never use the owner's personal email in deployments or requests.

## What this repo is

Medusa-inspired, **Workers-compatible** headless commerce engine on Next.js 16 (OpenNext Cloudflare), Neon Postgres (Drizzle), Better Auth, Resend, KV/R2/Images/Rate Limiting bindings.

- `src/modules/*` — isolated modules (own tables, no cross-module imports/FKs; enforced by `tests/architecture.test.ts`).
- `src/workflows/*` — compose modules (cart, checkout, order, catalog, store); compensations via `lib/workflow.ts`.
- `src/queries/*` cross-module reads; `src/subscribers/*` domain events (order emails).
- Admin dashboard `/admin/*` (editorial UI, Appearance editor with 5 theme presets), customer dashboard `/account/*`, Admin REST API `/api/admin/*` (API keys), Store API `/api/store/*`.
- **Plans & regions** (`src/lib/plan.ts` is the single source of truth): `PLAN` = starter|standard|advanced|multivendor, `REGION` = africa|international, set per deployment in wrangler vars. Out-of-plan features return 404 and are absent from menus, guide and docs. Unset PLAN → `starter` in production, `advanced` in dev.
- Client guide: Admin → Guide (`src/content/guide.ts`); `npm run docs` writes `docs/FEATURES.md` for the configured plan.
- Payments: Paystack (HMAC-SHA512), Flutterwave, Stripe; hosted checkout; server-to-server verification; idempotent webhooks; per-payment `returnUrl`/`cancelUrl` restricted to allowed origins.
- Allowed origins (`src/lib/origins.ts`): `APP_URL` + `STORE_CORS` + Settings → Storefront URL (+ any localhost in dev) drive CORS (Store API **and** `/api/auth/*`), Better Auth trusted origins and redirect validation.
- Dev only: embedded PGlite DB in `.data/`, **test-mode payments** at `/dev/pay` for providers without keys, `npm run seed` demo catalogue (Adire House, codes WELCOME10 / FREESHIP).
- Rate limiter and KV cache **fail open** (outages never block checkout).

## Storefront SDK (`packages/sdk`)

Typed, zero-dependency Store API client + React hooks (`useCart`, `useCustomer`, `useStoreConfig`). Handles lazy single-flight carts, serialized writes, stale/tampered cart recovery, cross-tab sync, GET-only retries, timeouts/abort, double-click-safe pay, validated payment returns, token auth across domains. `npm run sdk:sync -- ../storefront-starter` builds and vendors it into a storefront. See `packages/sdk/README.md`.

## Related repo

- `christianokuru/storefront-starter` — the per-client storefront skeleton (PWA shop, bag, checkout, accounts) built on the SDK. Restyle per client (brand tokens in `globals.css`, fonts in `layout.tsx`).

## Deployment (owner's test store)

- Cloudflare account subdomain: `okuruchristian.workers.dev`.
  - Engine: https://next-commerce-engine.okuruchristian.workers.dev (config `wrangler.staging.jsonc`, PLAN=advanced, all 3 providers allowed, R2 removed because R2 isn't enabled yet)
  - Storefront: https://storefront-starter.okuruchristian.workers.dev
- Deploys run through **GitHub Actions** (`.github/workflows/deploy.yml`, manual "Run workflow"), using the repo secret `CLOUDFLARE_API_TOKEN`. Deploying from the cloud sandbox fails (its proxy overwrites the asset-upload auth header).
- Worker runtime secrets live in Cloudflare (DATABASE_URL, BETTER_AUTH_SECRET, SETUP_TOKEN, payment keys). Database: a Neon test project.
- Recommend clients use **Workers Paid ($5/mo)**: engine is ~2.6 MB gzipped (free limit 3 MB) and the free plan's 10 ms CPU limit breaks Next.js under load. Use the client's domain + subdomains (`clientbrand.com` storefront, `admin.clientbrand.com` engine).

## Status / next steps (as of Nov 2026)

- Pending from owner: create own admin via `/setup` (owner sets SETUP_TOKEN in Cloudflare), add payment test keys + webhooks, add `RESEND_API_KEY` (no emails sent on live yet), enable R2 (Nigerian card rejected; try a virtual dollar card), set the GitHub default branch to `main`.
- Then: real sandbox payments for Paystack/Flutterwave/Stripe on the live store (success, decline, cancel, webhooks, refunds).
- Roadmap in `ROADMAP.md` (delete before client handover). Not yet tested: real provider payments, Google OAuth.

## Testing

- `npm test` — unit/integration (engine + SDK, PGlite). `npm run test:neon` with `TEST_DATABASE_URL`.
- `npm run e2e` (Workers + Neon, needs a clean DB), `npm run e2e:dev` (zero-config), `npm run e2e:auth`.
- Storefront browser E2E lives in the storefront repo (55 checks; run against a freshly seeded engine).
