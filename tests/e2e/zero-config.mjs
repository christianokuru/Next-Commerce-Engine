/**
 * Smoke test for zero-config local dev: run `npm run dev` with NO env vars, then `node tests/e2e/zero-config.mjs`.
 * Covers: setup without token, admin sign-in, appearance save, product create, Admin API (API key), Store API, customer `me` (bearer).
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE ?? "http://localhost:3000";
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`✓ ${m}`); };
const admin = { email: "owner@example.com", password: "Owner-Pass-2026!" };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
ctx.setDefaultTimeout(90000); // first compile in `next dev` can be slow
const p = await ctx.newPage();

const setup = await p.goto(`${BASE}/setup`);
if (setup.status() === 200) {
	ok((await p.locator("#token").count()) === 0, "setup needs no token in local dev");
	await p.fill("#name", "Store Owner"); await p.fill("#email", admin.email); await p.fill("#password", admin.password);
	await p.click("button[type=submit]");
	await p.waitForURL(/sign-in/);
} else await p.goto(`${BASE}/sign-in`);
await p.fill("#email", admin.email); await p.fill("#password", admin.password);
await p.click("button[type=submit]");
await p.waitForURL(/\/admin$/, { timeout: 60000 });
ok(true, "admin created and signed in (embedded Postgres)");

// Appearance: switch preset, save, confirm persisted CSS variables
await p.goto(`${BASE}/admin/appearance`);
await p.getByRole("heading", { name: "Appearance" }).waitFor();
await p.getByRole("button", { name: /Noir/ }).click();
await p.getByRole("button", { name: "Save appearance" }).click();
await p.getByText("Appearance saved").waitFor({ timeout: 20000 });
await p.goto(`${BASE}/admin`);
const css = await p.locator("#store-theme").innerHTML();
ok(css.includes("#141311") && css.includes("color-scheme:dark"), "theme saved and applied server-side");
await p.goto(`${BASE}/admin/appearance`);
await p.getByRole("button", { name: /Editorial/ }).click();
await p.getByRole("button", { name: "Save appearance" }).click();
await p.getByText("Appearance saved").waitFor({ timeout: 20000 });

// Settings: enable NGN, create API key
await p.goto(`${BASE}/admin/settings`);
await p.fill("input[name=name][placeholder*='Key name']", "Zapier");
await p.getByRole("button", { name: "Create" }).click();
const key = (await p.locator("code").filter({ hasText: /^nce_sk_[A-Za-z0-9_-]{20,}$/ }).first().innerText()).trim();
ok(key.startsWith("nce_sk_"), "API key created and shown once");

// Admin REST API with the key
const api = (path, init = {}) => fetch(BASE + path, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) } });
const created = await api("/api/admin/products", { method: "POST", body: JSON.stringify({
	title: "Ankara Shirt", status: "published", variants: [{ title: "Default", sku: "ANK-1", prices: [{ currencyCode: "NGN", amount: 1500000 }], stock: 5 }],
}) });
const cj = await created.json();
ok(created.status === 201 && cj.product.variants[0].inventory.stockedQuantity === 5, "Admin API: create product with stock (workflow: product + inventory)");
const inv = await api(`/api/admin/inventory/${cj.product.variants[0].id}`, { method: "POST", body: JSON.stringify({ mode: "adjust", quantity: 3 }) });
ok((await inv.json()).item.stockedQuantity === 8, "Admin API: adjust stock");
ok((await fetch(`${BASE}/api/admin/products`)).status === 401, "Admin API rejects unauthenticated calls");
ok((await api("/api/admin/products", { headers: { authorization: "Bearer nce_sk_invalidinvalidinvalidinvalid" } })).status === 401, "Admin API rejects invalid keys");
ok((await api("/api/admin/api-keys")).status === 403, "API keys cannot manage API keys");
const csrf = await p.request.post(`${BASE}/api/admin/categories`, { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { name: "x" } });
ok(csrf.status() === 403, "cookie-auth Admin API blocks cross-origin mutations (CSRF)");
const viaSession = await p.request.post(`${BASE}/api/admin/categories`, { headers: { origin: BASE, "content-type": "application/json" }, data: { name: "Men" } });
ok(viaSession.status() === 201, "Admin API works with the dashboard session too");

// Store API
const products = await (await fetch(`${BASE}/api/store/products`)).json();
ok(products.products[0]?.variants[0]?.inStock === true, "Store API lists product with availability");
ok((await fetch(`${BASE}/api/store/customers/me`)).status === 401, "Store API /customers/me requires auth");
const si = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(admin) });
const token = si.headers.get("set-auth-token");
ok(Boolean(token), "bearer token issued on sign-in (headless storefronts)");
const me = await fetch(`${BASE}/api/store/customers/me`, { headers: { authorization: `Bearer ${token}` } });
ok(me.status === 200 && (await me.json()).customer.email === admin.email, "Store API /customers/me works with bearer token");

await p.goto(`${BASE}/admin/products`);
ok(await p.getByText("Ankara Shirt").isVisible(), "product created via API visible in dashboard");
await browser.close();
console.log("\nZero-config dev checks passed");
