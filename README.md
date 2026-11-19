# Next Commerce Engine

A lightweight, modular commerce engine (Medusa-inspired) that runs **entirely on Next.js on Cloudflare Workers** — admin dashboard, customer dashboard, Store API, webhooks and background work, with no separate backend.

Headless by design: there is no public storefront. Any storefront (Next.js, mobile app…) talks to the **Store API**.

| Concern | Choice | Why it works on Workers |
|---|---|---|
| Runtime | Next.js 16 + `@opennextjs/cloudflare` (official C3 template) | Real Next.js compiled to a Worker |
| DB | Neon Postgres + Drizzle | HTTP driver for queries; short-lived WebSocket `Pool` per transaction (Workers forbid sharing sockets across requests) |
| Auth | Better Auth (drizzle adapter, DB rate-limit storage) | Web Crypto / `node:crypto` via `nodejs_compat`; no in-memory state |
| Payments | Paystack, Flutterwave, Stripe via `fetch` + Web Crypto HMAC | No Node SDKs (axios/`crypto.createHmac`) |
| Email | Resend REST API | Sent after the response via `after()` → `waitUntil` |
| Cache | Workers KV (tag-versioned) | Settings + public catalog only |
| Media | R2 originals + Cloudflare Images binding resize/WebP/AVIF | `/media/*` route + edge Cache API |
| Abuse | Workers Rate Limiting binding + Better Auth limiter | |
| UI | Tailwind v4 + shadcn/ui, mobile-first, installable PWA | |

## Architecture

```
src/
  modules/<name>/        # one folder per commerce module
    schema.ts            #   Drizzle tables owned by the module
    service.ts           #   business logic (framework-agnostic, unit-tested)
  modules/payment/providers/  # PaymentProvider interface + paystack/flutterwave/stripe
  modules/pricing/totals.ts   # pure totals engine (single source of truth for amounts)
  db/                    # driver (neon-http + ws transactions), schema barrel, relations
  lib/                   # env, auth, cache (KV), http helpers, validators, crypto, money
  server/                # session guards (requireAdmin / requireCustomer), store-api helpers
  app/
    admin/**             # store-owner dashboard (server components + server actions)
    account/**           # customer dashboard
    api/store/**         # public Store API (headless storefront contract)
    api/webhooks/[provider]
    api/payments/callback/[provider]
    media/[...key]       # R2 + Cloudflare Images
```

Modules: **store settings, products (options/variants/prices/images), categories, collections, inventory (ledger), customers & addresses, carts, shipping zones/rates, promotions, checkout, orders (timeline, fulfillment, cancel), payments & refunds, notifications, media.**

Money is always an integer in minor units (kobo/cents). Prices are per variant per currency.

## Payment flow & guarantees

1. `POST /api/store/carts/:id/payment {provider}` – cart is validated (stock, address, shipping, promo); **amount computed server-side**; a `payments` row is created with a random merchant reference; shopper is redirected to the provider's hosted page. Repeat calls with an unchanged cart reuse the pending session.
2. Shopper returns to `/api/payments/callback/:provider` **and/or** the provider calls `/api/webhooks/:provider`.
3. Both paths call `confirmPayment`, which **re-verifies with the provider API** (redirect params and webhook bodies are never trusted), then in one DB transaction: locks payment + cart rows, checks captured amount/currency **equal** the expected amount, re-computes the cart total, creates the order, decrements stock with conditional updates, records promo usage, completes the cart.
4. Idempotency: row locks + `orders.cart_id UNIQUE` + `payments.reference UNIQUE` + `webhook_events(provider,event_id) UNIQUE`. Webhooks are signature-verified (Paystack HMAC-SHA512, Stripe `v1` + timestamp tolerance, Flutterwave `verif-hash`/HMAC) with constant-time comparison.
5. Anything suspicious (amount mismatch, cart edited after payment start, double payment) marks the payment `requires_action` and surfaces it on the admin overview — **never** a silent order. A race for the last unit creates the order flagged `requires_action` (money was taken) instead of overselling.

## Store API

| Method | Path | |
|---|---|---|
| GET | `/api/store/settings` | name, currencies, providers per currency |
| GET | `/api/store/products?currency=&q=&category=&collection=&limit=&offset=` | KV cached |
| GET | `/api/store/products/:handle?currency=` | |
| GET | `/api/store/categories`, `/api/store/collections` | |
| POST | `/api/store/carts` `{currencyCode?, email?}` | |
| GET/POST | `/api/store/carts/:id` `{email, shippingAddress, billingAddress}` | |
| POST | `/api/store/carts/:id/line-items` `{variantId, quantity}` | |
| PATCH/DELETE | `/api/store/carts/:id/line-items/:itemId` | |
| GET | `/api/store/carts/:id/shipping-options` | |
| POST | `/api/store/carts/:id/shipping-method` `{optionId}` | |
| POST/DELETE | `/api/store/carts/:id/promotion` `{code}` | rate limited |
| GET/POST | `/api/store/carts/:id/payment` `{provider, cancelUrl?}` → `{redirectUrl}` | rate limited |

After payment the shopper is redirected to `{storefrontUrl}/checkout/complete?status=succeeded&order=…&number=…` (or the built-in `/checkout/result` page if no storefront URL is set). Allow browser storefront origins with `STORE_CORS`.

## Local development

```bash
npm install
cp .env.example .env.local   # fill DATABASE_URL (a Neon branch), BETTER_AUTH_SECRET, SETUP_TOKEN
cp .env.local .dev.vars      # same values for wrangler; set APP_URL=http://localhost:8787 here
npm run db:migrate
npm run dev                  # http://localhost:3000 → /setup to create the first admin
```

Workers-runtime preview (real workerd, local KV/R2/Images simulators): `npm run preview`.

## Tests

```bash
npm test             # unit + integration (in-process Postgres via PGlite, real migrations)
npm run test:neon    # checkout suite against real Neon (WebSocket transactions, row locks, concurrency)
npm run e2e          # Playwright against the running worker (BASE, SETUP_TOKEN, PAYSTACK_SECRET_KEY, WRANGLER_LOG)
npm run e2e:auth     # auth flows on a fresh DB: setup, sign-in/up, verification, reset, change password, revocation, rate limits, RBAC
```

Covered: totals/tax/promotions, stock enforcement, idempotent concurrent confirmations (one order), oversell race, tampered amounts, cart edits after payment start, failed payments, refunds (partial/full), cancel + restock, webhook signature/dedupe for all three providers, upload type sniffing, and a browser E2E on workerd (setup → admin → products → R2/Images → Store API → webhooks → customer verification → access control → PWA/headers).

## Deploy to Cloudflare

```bash
npx wrangler login
# set real values in wrangler.jsonc "vars" (APP_URL, STORE_NAME, EMAIL_FROM, STORE_CORS)
for s in DATABASE_URL BETTER_AUTH_SECRET SETUP_TOKEN RESEND_API_KEY PAYSTACK_SECRET_KEY \
  FLUTTERWAVE_SECRET_KEY FLUTTERWAVE_WEBHOOK_HASH STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do npx wrangler secret put $s; done
npm run db:migrate
npm run deploy   # KV namespace + R2 bucket are auto-provisioned on first deploy
```

Then configure webhooks to `https://<your-app>/api/webhooks/{paystack|flutterwave|stripe}` (Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`), open `/setup`, and enable providers in **Admin → Settings**.

Notes
- **Workers Paid plan recommended**: password hashing (scrypt) needs more than the free plan's 10 ms CPU.
- Bundle: ~2.7 MB gzipped (within limits).
- Dark mode follows the OS via CSS only (theme scripts that rely on `Function.toString` break under OpenNext's `keepNames` bundling).

## Security checklist (implemented)

Role checked from DB on every admin action; `role` cannot be set via auth APIs; customer data scoped by customer id (no IDOR); guest orders linked to accounts only after **verified** email; Zod validation at every boundary; generic error messages; CSP/HSTS/frame-ancestors; private no-store caching for dashboards; upload magic-byte sniffing (SVG rejected) + size limit; secrets only via Worker secrets; SW never caches API/auth pages; first-admin setup gated by `SETUP_TOKEN` and self-disables.
