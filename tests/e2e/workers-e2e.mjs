/**
 * End-to-end smoke test against the BUILT worker running in workerd (`npm run preview` / wrangler dev).
 * Usage: BASE=http://localhost:8787 SETUP_TOKEN=... PAYSTACK_SECRET_KEY=... WRANGLER_LOG=path node tests/e2e/workers-e2e.mjs
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const shots = process.env.SHOTS ?? ".";
const admin = { name: "Store Admin", email: `admin+${Date.now()}@example.com`, password: "Sup3r-Secret-Pass!" };
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`✓ ${msg}`); };
const api = async (path, init = {}) => {
	const r = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
	const text = await r.text();
	let body; try { body = JSON.parse(text); } catch { body = text; }
	return { status: r.status, body };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));

// 1. Bootstrap first admin
await page.goto(`${BASE}/setup`);
await page.fill("#token", process.env.SETUP_TOKEN);
await page.fill("#name", admin.name);
await page.fill("#email", admin.email);
await page.fill("#password", admin.password);
await page.click("button[type=submit]");
await page.waitForURL(/sign-in/, { timeout: 30000 });
ok(true, "first admin created via /setup");
ok((await fetch(`${BASE}/setup`)).status === 404, "/setup disabled once an admin exists");

// 2. Sign in (Better Auth on Workers: scrypt hashing + DB rate limiter)
await page.fill("#email", admin.email);
await page.fill("#password", admin.password);
await page.click("button[type=submit]");
await page.waitForURL(/\/admin$/, { timeout: 30000 });
await page.getByRole("heading", { name: "Overview", exact: true }).waitFor({ timeout: 15000 });
ok(true, "admin dashboard renders (mobile viewport)");
await page.screenshot({ path: `${shots}/admin-overview-mobile.png`, fullPage: true });

// 3. Settings: enable Paystack, NGN + USD, 7.5% inclusive VAT
await page.goto(`${BASE}/admin/settings`);
await page.fill("#currencies", "NGN, USD");
await page.fill("#taxRate", "7.5");
await page.check("input[name=provider_paystack]");
await page.click("text=Save settings");
await page.getByText("Settings saved").waitFor({ timeout: 15000 });
ok(true, "store settings saved (server action + KV invalidation)");

// 4. Shipping zone + rate
await page.goto(`${BASE}/admin/shipping`);
await page.fill("#name", "Nigeria");
await page.fill("#countries", "NG");
await page.click("text=Create zone");
await page.getByText("Zone created").waitFor({ timeout: 15000 });
await page.reload();
await page.click("summary:has-text('Add rate')");
await page.locator("form:has(input[name=zoneId]) #name").fill("Lagos Standard");
await page.locator("form:has(input[name=zoneId]) #amount").fill("2500");
await page.click("button:has-text('Add rate')");
await page.getByText("Shipping option created").waitFor({ timeout: 15000 });
ok(true, "shipping zone + rate created");

// 5. Product (transaction over Neon WebSocket Pool on workerd)
await page.goto(`${BASE}/admin/products/new`);
await page.fill("#title", "Ankara Shirt");
await page.fill("#description", "Hand-made in Lagos");
await page.selectOption("#status", "published");
await page.fill("#price_NGN", "15000");
await page.fill("#price_USD", "20");
await page.fill("#sku", `ANK-${Date.now()}`);
await page.fill("#stock", "3");
await page.click("text=Create product");
await page.waitForURL(/\/admin\/products\/prod_/, { timeout: 30000 });
ok(true, "product created and redirected to editor");

// 6. Image upload → R2, served via /media with Cloudflare Images resize
const png = await createRequire(import.meta.url)("sharp")({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer();
writeFileSync(`${shots}/test.png`, png);
await page.setInputFiles("input[type=file]", `${shots}/test.png`);
await page.getByText("Image added").waitFor({ timeout: 30000 });
await page.reload();
const imgSrc = await page.locator("img[src^='/media/products/']").first().getAttribute("src");
const imgRes = await fetch(BASE + imgSrc, { headers: { accept: "image/webp" } });
const imgBytes = (await imgRes.clone().arrayBuffer()).byteLength;
console.log("  resized image:", imgRes.headers.get("content-type"), imgBytes, "bytes");
ok(imgRes.status === 200 && imgRes.headers.get("content-type")?.startsWith("image/"), `image served from R2 (${imgRes.headers.get("content-type")})`);
ok((await api("/api/admin/uploads", { method: "POST", body: "{}" })).status === 401, "upload API rejects anonymous requests");
await page.screenshot({ path: `${shots}/admin-product-mobile.png`, fullPage: true });

// 7. Store API (headless storefront contract)
const products = await api("/api/store/products?currency=NGN");
const product = products.body.products.find((p) => p.title === "Ankara Shirt");
ok(product && product.variants[0].price.amount === 1500000, "Store API lists published product with NGN price in kobo");
ok(!("stockedQuantity" in product.variants[0]) && product.variants[0].inStock === true, "Store API hides stock counts");
const variantId = product.variants[0].id;
const cart = (await api("/api/store/carts", { method: "POST", body: JSON.stringify({ currencyCode: "NGN" }) })).body.cart;
ok(cart.id.startsWith("cart_"), "cart created");
const tooMany = await api(`/api/store/carts/${cart.id}/line-items`, { method: "POST", body: JSON.stringify({ variantId, quantity: 4 }) });
ok(tooMany.status === 422, "cannot add more than stock");
await api(`/api/store/carts/${cart.id}/line-items`, { method: "POST", body: JSON.stringify({ variantId, quantity: 2 }) });
const addr = { firstName: "Ada", lastName: "Obi", address1: "1 Marina", city: "Lagos", countryCode: "ng" };
await api(`/api/store/carts/${cart.id}`, { method: "POST", body: JSON.stringify({ email: "ada@example.com", shippingAddress: addr }) });
const so = (await api(`/api/store/carts/${cart.id}/shipping-options`)).body.shippingOptions;
ok(so.length === 1 && so[0].amount === 250000, "shipping options resolved for NG");
const withShip = (await api(`/api/store/carts/${cart.id}/shipping-method`, { method: "POST", body: JSON.stringify({ optionId: so[0].id }) })).body.cart;
ok(withShip.totals.total === 3250000 && withShip.totals.taxTotal === Math.round(3000000 - 3000000 / 1.075), `server-side totals correct (${withShip.totals.total})`);
const bad = await api(`/api/store/carts/${cart.id}/line-items`, { method: "POST", body: JSON.stringify({ variantId: "nope", quantity: 1 }) });
ok(bad.status === 400, "input validation rejects malformed ids");
const providers = (await api(`/api/store/carts/${cart.id}/payment`)).body.providers;
ok(providers.some((p) => p.id === "paystack"), "Paystack offered for NGN");

// 8. Payment initiation → real outbound call to api.paystack.co from workerd (fake key → provider rejects)
const pay = await api(`/api/store/carts/${cart.id}/payment`, { method: "POST", body: JSON.stringify({ provider: "paystack" }) });
ok(pay.status === 402 && pay.body.error.code === "payment_error", "provider error surfaced safely (no secrets/internal errors leaked)");

// 9. Webhooks on workerd: Web Crypto HMAC verification + dedupe
const evt = JSON.stringify({ event: "charge.success", data: { id: Date.now(), reference: "nce_unknownreference00" } });
const badSig = await fetch(`${BASE}/api/webhooks/paystack`, { method: "POST", body: evt, headers: { "x-paystack-signature": "deadbeef" } });
ok(badSig.status === 401, "webhook with invalid signature rejected");
const sig = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(evt).digest("hex");
const good = await fetch(`${BASE}/api/webhooks/paystack`, { method: "POST", body: evt, headers: { "x-paystack-signature": sig } });
const goodBody = await good.json();
ok(good.status === 200 && goodBody.ignored, "valid signature accepted; unknown reference ignored");
const dup = await (await fetch(`${BASE}/api/webhooks/paystack`, { method: "POST", body: evt, headers: { "x-paystack-signature": sig } })).json();
ok(dup.duplicate === true, "duplicate webhook event de-duplicated");

// 10. Callback with tampered reference never creates an order
const cb = await fetch(`${BASE}/api/payments/callback/paystack?reference=<script>`, { redirect: "manual" });
ok(cb.status === 303 && cb.headers.get("location").includes("status=invalid"), "callback rejects malformed reference");

// 11. Customer sign-up → email verification → customer dashboard
const cust = { name: "Ada Obi", email: `ada+${Date.now()}@example.com`, password: "customer-pass-123" };
const cpage = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await cpage.goto(`${BASE}/sign-up`);
await cpage.fill("#name", cust.name); await cpage.fill("#email", cust.email); await cpage.fill("#password", cust.password);
await cpage.click("button[type=submit]");
await cpage.getByText("Check your email").waitFor({ timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
const log = readFileSync(process.env.WRANGLER_LOG, "utf8");
const link = [...log.matchAll(/Verify email: (http\S+)/g)].map((m) => m[1]).filter((u) => u.includes("callbackURL=%2Faccount")).pop();
ok(Boolean(link), "verification email generated (dev logger)");
await cpage.goto(link);
await cpage.waitForURL(/\/account/, { timeout: 30000 });
ok(await cpage.getByText("No orders yet").first().isVisible(), "verified customer lands on account dashboard");
await cpage.screenshot({ path: `${shots}/account-mobile.png`, fullPage: true });
await cpage.goto(`${BASE}/admin`);
ok(cpage.url().endsWith("/account"), "customer cannot access /admin");

// 12. Security headers + PWA
const h = await fetch(`${BASE}/sign-in`);
ok(h.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP + security headers present");
const mf = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
ok(mf.display === "standalone" && mf.icons.length >= 2, "PWA manifest served");
ok((await fetch(`${BASE}/sw.js`)).status === 200, "service worker served");

await browser.close();
console.log("\nAll Workers E2E checks passed");
