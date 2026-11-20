# Roadmap

Working list. Tick items as they ship; delete this file once we're satisfied. ★ = high impact.

**Suggested build order:** 1. Storefront starter + SDK → 2. WhatsApp/SMS notifications → 3. Bank transfer/USSD + order tracking → 4. Staff roles → 5. Better promotions + abandoned carts.

## Developer (building client stores)

- [ ] ★ **Storefront starter + typed SDK** — ready Next.js storefront kit (PWA, mobile-first) on the Store API, plus a tiny typed client (`sdk.cart.add()` etc.). New client = clone, rebrand, deploy.
- [ ] ★ **One-command deploy** — `npm run setup:cloudflare`: interactively creates Neon DB, KV, R2 and secrets. New client live in ~10 minutes.
- [ ] **Demo data** — `npm run seed` for sample products/orders (client demos).
- [ ] **Outgoing webhooks** — notify Zapier, Slack, ERPs on order placed/shipped/refunded.
- [ ] **Plugin slots** — clean extension points for per-client custom fields and logic without touching core, so updates stay easy.

## Admin (store owner & staff)

- [ ] ★ **WhatsApp + SMS alerts** — new orders and low stock (Termii / WhatsApp Cloud API).
- [ ] ★ **Staff roles** — owner / manager / packer; packers can't refund or change settings.
- [ ] **Bulk tools** — CSV product import/export, bulk price & stock edits, printable packing slips & invoices.
- [ ] **Better promotions:**
  - product-, category- or collection-specific discounts
  - automatic discounts (no code)
  - buy X get Y
  - one use per customer / first order only
  - stacking rules
  - gift cards / store credit
- [ ] **Reports** — best sellers, revenue by period, repeat customers, promo performance; CSV export.
- [ ] **Abandoned cart recovery** — email/WhatsApp reminders (usually recovers ~5–15% of lost sales).
- [ ] **Audit log** — who changed what, when.

## Customer

- [ ] ★ **Bank transfer + USSD** — via Paystack and Flutterwave (many Nigerians don't pay by card).
- [ ] ★ **Order tracking page** — timeline (paid → packed → shipped → delivered), courier tracking number, WhatsApp updates at each step.
- [ ] **Local shipping:**
  - rates by state/LGA
  - pickup points
  - GIG / Sendbox / Kwik integration for live rates and tracking
- [ ] **Guest checkout + magic-link login** — no passwords to remember.
- [ ] **Reorder, wishlist, saved cards** — saved cards via Paystack authorization reuse.
- [ ] **Returns requests** — customer starts a return; admin approves and refunds.
- [ ] **Multi-currency display** — USD/GBP/EUR for foreign-client stores.

## Known gaps to verify

- [ ] Real sandbox payment through Paystack, Flutterwave and Stripe (needs keys).
- [ ] Google sign-in (needs OAuth keys).
- [ ] First real deploy to a Cloudflare account.
