# Next Commerce Engine

A lightweight, modular commerce engine (Medusa-inspired) that runs **entirely on Next.js on Cloudflare Workers** — admin dashboard, customer dashboard, Store API, webhooks and background work, with no separate backend.

Headless by design: there is no public storefront. Any storefront (Next.js, mobile app…) talks to the **Store API**.

## Quick start (zero config)

```bash
npm install
npm run dev        # → http://localhost:3000/setup
```

No env file, no database to provision: with `DATABASE_URL` unset, `npm run dev` runs an embedded Postgres (PGlite, saved in `.data/`) and applies migrations automatically. A dev-only auth secret is used, `/setup` needs no token locally, emails print to the terminal, and payment providers show "Missing keys" until you add them. Set `DATABASE_URL` in `.env.local` to develop against Neon instead (migrations still run automatically).

**Errors about `DATABASE_URL` or `BETTER_AUTH_SECRET`?** You're not on `npm run dev` (e.g. `npm start`, `npm run preview`, or a production build), or `.env.local` holds a wrong Neon URL. Locally, use `npm run dev` and either delete `.env.local` or remove its `DATABASE_URL` line. Placeholder values copied from `.env.example` are ignored automatically.

## Architecture (Medusa-style, without the config)

```
src/
  modules/<name>/      # isolated commerce modules — own tables, no imports of other modules, no cross-module FKs
    schema.ts          #   Drizzle tables
    service.ts         #   data + rules for that module only
  workflows/           # compose modules: cart, checkout, order, catalog (transactions + compensation steps)
  queries/             # cross-module reads (store catalog, admin views) via module links
  subscribers/         # domain event handlers (order.placed → emails, order.shipped …)
  db/links.ts          # module links (relations between modules for queries)
  lib/                 # infra: env, auth, cache (KV), http, workflow runner, events, crypto, money
  server/              # session guards, Admin API auth, input schemas
  app/
    admin/**           # admin dashboard (server components + server actions)
    account/**         # customer dashboard
    api/admin/**       # Admin REST API
    api/store/**       # Store API (headless storefront contract), incl. /customers/me
    api/webhooks/[provider], api/payments/callback/[provider], media/[...key]
```

Modules: **auth (roles, API keys), store (settings, theme), product, inventory, customer, cart, shipping, promotion, order, payment (+ providers), pricing, notification, media.**
`tests/architecture.test.ts` fails the build if a module imports another module or a schema adds a cross-module foreign key.

| Concern | Choice | Why it works on Workers |
|---|---|---|
| Runtime | Next.js 16 + `@opennextjs/cloudflare` (official C3 template) | Real Next.js compiled to a Worker |
| DB | Neon Postgres + Drizzle | HTTP driver for queries; short-lived WebSocket `Pool` per transaction |
| Auth | Better Auth (+ bearer plugin) | Web Crypto / `node:crypto` via `nodejs_compat`; DB-backed rate limits |
| Payments | Paystack, Flutterwave, Stripe via `fetch` + Web Crypto HMAC | No Node SDKs |
| Email | Resend REST | Sent by subscribers after the response (`after()` → `waitUntil`) |
| Cache / Media / Abuse | KV, R2 + Cloudflare Images, Workers Rate Limiting | Native bindings |
| UI | Tailwind v4 + shadcn/ui, editorial design system, PWA | Theme is CSS variables — no client theme script |

## Plan & region (set per deployment)

Two Worker vars in `wrangler.jsonc` decide what this store includes:

```jsonc
"PLAN": "standard",   // set by your developer
"REGION": "africa"    // africa (NGN, Paystack/Flutterwave) | international (USD, Stripe)
```

- Features outside the plan are hidden everywhere (menu, pages, guide, docs, APIs return 404) and enforced on the server.
- Region only sets first-run defaults (currency, payment providers). `ALLOWED_PAYMENT_PROVIDERS=paystack,stripe` overrides providers.
- Unset `PLAN` → `starter` in production.

**Store guide:** Admin → **Guide** explains every feature this store has. The same content is in [`docs/FEATURES.md`](docs/FEATURES.md); regenerate it for the deployed plan with `npm run docs` (source: `src/content/guide.ts`).

## Appearance (Admin → Appearance)

Editorial by default (warm newsprint, Fraunces + Inter, hairline rules). Five presets (Editorial, Gazette, Atelier, Noir, Modern) or customise paper/ink/accent colours, headline + body fonts (8 self-hosted fonts), layout (rules or cards), corners and density. Changes preview live across the whole dashboard and apply to both admin and customer dashboards on save. Values are schema-validated before being rendered into CSS.

## Admin REST API

Everything the dashboard does, as JSON (`/api/admin/*`, money in minor units):
products (+ variants, options), categories, collections, inventory, orders (fulfillment, cancel, refunds, notes), customers, promotions, shipping zones/rates, settings (incl. theme), uploads.

Auth: create a key in **Admin → Settings → API keys** and send `Authorization: Bearer nce_sk_…` (only a SHA-256 hash is stored; revocable; keys can't mint keys). The signed-in dashboard session also works; cookie-auth mutations are rejected from foreign origins.

```bash
curl -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Ankara Shirt","status":"published","variants":[{"prices":[{"currencyCode":"NGN","amount":1500000}],"stock":5}]}' \
  https://your-app/api/admin/products
```

## Payment flow & guarantees

1. `POST /api/store/carts/:id/payment {provider}` – cart is validated (stock, address, shipping, promo); **amount computed server-side**; a `payments` row is created with a random merchant reference; shopper is redirected to the provider's hosted page. Repeat calls with an unchanged cart reuse the pending session.
2. Shopper returns to `/api/payments/callback/:provider` **and/or** the provider calls `/api/webhooks/:provider`.
3. Both paths call `confirmPayment`, which **re-verifies with the provider API** (redirect params and webhook bodies are never trusted), then in one DB transaction: locks payment + cart rows, checks captured amount/currency **equal** the expected amount, re-computes the cart total, creates the order, decrements stock with conditional updates, records promo usage, completes the cart.
4. Idempotency: row locks + `orders.cart_id UNIQUE` + `payments.reference UNIQUE` + `webhook_events(provider,event_id) UNIQUE`. Webhooks are signature-verified (Paystack HMAC-SHA512, Stripe `v1` + timestamp tolerance, Flutterwave `verif-hash`/HMAC) with constant-time comparison.
5. Anything suspicious (amount mismatch, cart edited after payment start, double payment) marks the payment `requires_action` and surfaces it on the admin overview — **never** a silent order. A race for the last unit creates the order flagged `requires_action` (money was taken) instead of overselling.

## Store API

| Method | Path | |
|---|---|---|
| GET | `/api/store/config` | `{ region, features: [...] }`: features this store has (show sign-in, discount box, etc.) |
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
| GET/PATCH | `/api/store/customers/me` | signed-in customer |
| GET | `/api/store/customers/me/orders`, `/orders/:id` | scoped to the customer |
| GET/POST/DELETE | `/api/store/customers/me/addresses[/:id]` | |
| GET/POST | `/api/store/carts/:id/payment` `{provider, cancelUrl?}` → `{redirectUrl}` | rate limited |

Customer auth for storefronts: `POST /api/auth/sign-up/email`, `/sign-in/email` (Better Auth). On another domain, read the `set-auth-token` response header and send it as `Authorization: Bearer <token>`; on the same parent domain, cookies just work.

After payment the shopper is redirected to `{storefrontUrl}/checkout/complete?status=succeeded&order=…&number=…` (or the built-in `/checkout/result` page if no storefront URL is set). Allow browser storefront origins with `STORE_CORS`.

## Tests

```bash
npm test             # unit + integration (in-process Postgres via PGlite, real migrations)
npm run test:neon    # checkout suite against real Neon (WebSocket transactions, row locks, concurrency)
npm run e2e          # Playwright against the running worker (BASE, SETUP_TOKEN, PAYSTACK_SECRET_KEY, WRANGLER_LOG)
npm run e2e:dev      # zero-config dev: setup, theme, API keys, Admin API, CSRF, Store API, bearer tokens
npm run e2e:auth     # auth flows on a fresh DB: setup, sign-in/up, verification, reset, change password, revocation, rate limits, RBAC
```

Covered: totals/tax/promotions, stock enforcement, idempotent concurrent confirmations (one order), oversell race, tampered amounts, cart edits after payment start, failed payments, refunds (partial/full), cancel + restock, webhook signature/dedupe for all three providers, upload type sniffing, and a browser E2E on workerd (setup → admin → products → R2/Images → Store API → webhooks → customer verification → access control → PWA/headers).

## Deploy to Cloudflare

```bash
npx wrangler login
# set real values in wrangler.jsonc "vars" (APP_URL, STORE_NAME, EMAIL_FROM, STORE_CORS)
for s in DATABASE_URL BETTER_AUTH_SECRET SETUP_TOKEN RESEND_API_KEY PAYSTACK_SECRET_KEY \
  FLUTTERWAVE_SECRET_KEY FLUTTERWAVE_WEBHOOK_HASH STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do npx wrangler secret put $s; done
npm run deploy   # runs migrations (DATABASE_URL in .env), builds, deploys; KV + R2 auto-provisioned
```

Then configure webhooks to `https://<your-app>/api/webhooks/{paystack|flutterwave|stripe}` (Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`), open `/setup`, and enable providers in **Admin → Settings**.

Notes
- **Workers Paid plan recommended**: password hashing (scrypt) needs more than the free plan's 10 ms CPU.
- Bundle: ~2.7 MB gzipped (within limits).
- Dark mode follows the OS via CSS only (theme scripts that rely on `Function.toString` break under OpenNext's `keepNames` bundling).

## Security checklist (implemented)

Role checked from DB on every admin action; `role` cannot be set via auth APIs; customer data scoped by customer id (no IDOR); guest orders linked to accounts only after **verified** email; Zod validation at every boundary; generic error messages; CSP/HSTS/frame-ancestors; private no-store caching for dashboards; upload magic-byte sniffing (SVG rejected) + size limit; secrets only via Worker secrets; SW never caches API/auth pages; first-admin setup gated by `SETUP_TOKEN` and self-disables.
