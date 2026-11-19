/**
 * Auth E2E against the running worker + real database.
 * Usage: BASE=http://localhost:8787 SETUP_TOKEN=... WRANGLER_LOG=path [CUSTOMER_EMAIL=...] node tests/e2e/auth-e2e.mjs
 * Expects a database with no admin yet.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE ?? "http://localhost:8787";
const LOG = process.env.WRANGLER_LOG;
const admin = { name: "Store Owner", email: process.env.ADMIN_EMAIL ?? "owner@example.com", password: process.env.ADMIN_PASSWORD ?? "Owner-Pass-2026!" };
const cust = { name: "Ada Obi", email: process.env.CUSTOMER_EMAIL ?? `ada+${Date.now()}@example.com`, password: "customer-pass-123" };
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`✓ ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const authApi = (path, body, headers = {}) =>
	fetch(`${BASE}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, ...headers }, body: JSON.stringify(body) });
const lastLink = (needle) => [...readFileSync(LOG, "utf8").matchAll(/: (http\S+)/g)].map((m) => m[1]).filter((u) => u.includes(needle)).pop();

const browser = await chromium.launch();
const newPage = async () => (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const signIn = async (page, email, password) => {
	await page.goto(`${BASE}/sign-in`);
	await page.fill("#email", email); await page.fill("#password", password);
	await page.click("button[type=submit]");
};

// --- Setup / first admin
const p = await newPage();
await p.goto(`${BASE}/setup`);
await p.fill("#token", "wrong-token"); await p.fill("#name", admin.name); await p.fill("#email", admin.email); await p.fill("#password", admin.password);
await p.click("button[type=submit]");
await p.getByText("Invalid setup token").waitFor({ timeout: 15000 });
ok(true, "setup rejects a wrong SETUP_TOKEN");
await p.fill("#token", process.env.SETUP_TOKEN);
await p.click("button[type=submit]");
await p.waitForURL(/sign-in/, { timeout: 30000 });
ok((await fetch(`${BASE}/setup`)).status === 404, "setup creates first admin, then disables itself");

// --- Admin sign-in
await signIn(p, admin.email, "wrong-password");
await p.locator("[data-sonner-toast]").first().waitFor({ timeout: 15000 });
ok(p.url().includes("/sign-in"), "wrong password rejected");
await signIn(p, admin.email, admin.password);
await p.waitForURL(/\/admin$/, { timeout: 30000 });
ok(true, "admin signs in → /admin");

// --- Anonymous access control
const anon = await newPage();
await anon.goto(`${BASE}/admin/orders`);
ok(anon.url().includes("/sign-in"), "anonymous /admin → sign-in");
await anon.goto(`${BASE}/account`);
ok(anon.url().includes("/sign-in"), "anonymous /account → sign-in");

// --- Customer sign-up (privilege escalation attempt in payload)
const su = await authApi("/sign-up/email", { name: cust.name, email: cust.email, password: cust.password, role: "admin", callbackURL: "/account" });
ok(su.status === 200 || su.status === 400, `sign-up API responded ${su.status}`);
const c = await newPage();
await signIn(c, cust.email, cust.password);
await c.locator("[data-sonner-toast]").first().waitFor({ timeout: 15000 });
ok(c.url().includes("/sign-in"), "unverified email cannot sign in");
await sleep(1500);
const verify = lastLink("verify-email");
ok(Boolean(verify), "verification email sent (dev logger)");
await c.goto(verify);
await c.waitForURL(/\/account/, { timeout: 30000 });
ok(true, "email verification auto-signs-in → /account");
await c.goto(`${BASE}/admin`);
ok(c.url().endsWith("/account"), "role=admin in sign-up payload ignored; customer blocked from /admin");
const up = await c.request.post(`${BASE}/api/admin/uploads`, { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
ok(up.status() === 403, "customer gets 403 on admin API");
const foreign = await c.goto(`${BASE}/account/orders/order_00000000000000000000000000`);
ok(foreign.status() === 404, "customer cannot open orders that are not theirs (404)");

// --- Sign out
await c.goto(`${BASE}/account`);
await c.getByRole("button", { name: "Sign out" }).click();
await c.waitForURL(/sign-in/, { timeout: 15000 });
await c.goto(`${BASE}/account`);
ok(c.url().includes("/sign-in"), "sign-out ends the session");

// --- Forgot / reset password
await c.goto(`${BASE}/forgot-password`);
await c.fill("#email", cust.email); await c.click("button[type=submit]");
await c.getByText("Check your email").waitFor({ timeout: 15000 });
await sleep(1500);
const reset = lastLink("reset-password");
ok(Boolean(reset), "password reset email sent");
const unknown = await authApi("/request-password-reset", { email: "nobody@example.com", redirectTo: "/reset-password" });
ok(unknown.status === 200, "reset for unknown email gives same response (no enumeration)");
await c.goto(reset);
await c.waitForURL(/reset-password\?token=/, { timeout: 15000 });
const newPass = "brand-new-pass-456";
await c.fill("#password", newPass); await c.click("button[type=submit]");
await c.waitForURL(/sign-in/, { timeout: 15000 });
ok((await authApi("/sign-in/email", { email: cust.email, password: cust.password })).status === 401, "old password no longer works");
await signIn(c, cust.email, newPass);
await c.waitForURL(/\/$|\/account/, { timeout: 30000 });
ok(true, "new password works");
ok((await authApi("/reset-password", { newPassword: "x-another-pass-1", token: new URL(reset).pathname.split("/").pop() })).status >= 400, "reset token is single-use");

// --- Change password revokes other sessions
await sleep(61000); // stay under the 5 sign-ins/minute limit exercised above
const other = await newPage();
await signIn(other, cust.email, newPass);
await other.waitForURL(/\/account/, { timeout: 30000 });
await c.goto(`${BASE}/account/profile`);
await c.fill("#currentPassword", newPass); await c.fill("#newPassword", "final-pass-789");
await c.click("button:has-text('Change password')");
await c.getByText("Password changed").waitFor({ timeout: 15000 });
ok(true, "password changed from profile");
const otherCookies = (await other.context().cookies()).map((x) => `${x.name}=${x.value}`).join("; ");
const s = await (await fetch(`${BASE}/api/auth/get-session?disableCookieCache=true`, { headers: { cookie: otherCookies } })).json();
ok(s === null, "other device's session revoked in the database");

// --- Rate limiting (Better Auth, database storage): 5 sign-ins / minute
let limited = false;
for (let i = 0; i < 8; i++) {
	const r = await authApi("/sign-in/email", { email: "bruteforce@example.com", password: `guess-${i}` }, { "cf-connecting-ip": "203.0.113.9" });
	if (r.status === 429) { limited = true; break; }
}
ok(limited, "brute-force sign-in attempts are rate limited (429)");

await browser.close();
console.log("\nAll auth E2E checks passed");
