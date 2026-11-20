import { describe, expect, it, vi } from "vitest";
import { createCommerce, CommerceError, formatMoney, memoryStorage, isCommerceError } from "../src";

const CART = "cart_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CART2 = "cart_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const cartBody = (id = CART, items: unknown[] = [], extra: Record<string, unknown> = {}) => ({
	cart: { id, email: null, currencyCode: "NGN", shippingAddress: null, billingAddress: null, completedAt: null, items, shippingOption: null, promotion: null,
		totals: { subtotal: 0, itemDiscount: 0, shippingDiscount: 0, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 0, promotionError: null }, ...extra },
});
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

type Route = (req: { url: URL; method: string; body: unknown; headers: Headers }) => Response | Promise<Response>;
function setup(route: Route, opts: { storage?: Record<string, string>; retries?: number; timeoutMs?: number } = {}) {
	const calls: { method: string; path: string; body: unknown; headers: Headers }[] = [];
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		const headers = new Headers(init?.headers);
		calls.push({ method: init?.method ?? "GET", path: url.pathname + url.search, body, headers });
		if (init?.signal?.aborted) throw init.signal.reason;
		return route({ url, method: init?.method ?? "GET", body, headers });
	});
	const storage = memoryStorage(opts.storage);
	const sdk = createCommerce({ baseUrl: "https://engine.test/", fetch: fetch as unknown as typeof globalThis.fetch, storage, retries: opts.retries ?? 2, timeoutMs: opts.timeoutMs });
	return { sdk, calls, storage, fetch };
}

describe("config", () => {
	it("requires an absolute baseUrl", () => {
		expect(() => createCommerce({ baseUrl: "/api" })).toThrow(/absolute/);
	});
});

describe("cart", () => {
	it("is created lazily on first add, and only once under parallel adds", async () => {
		let creates = 0;
		const { sdk, calls, storage } = setup(({ url, method }) => {
			if (url.pathname === "/api/store/carts" && method === "POST") { creates++; return json(201, cartBody()); }
			if (url.pathname.endsWith("/line-items")) return json(200, cartBody(CART, [{ id: "x" }]));
			return json(404, { error: { code: "not_found", message: "nope" } });
		});
		expect(await sdk.cart.get()).toBeNull();
		expect(calls).toHaveLength(0); // browsing never creates carts
		await Promise.all([sdk.cart.add("variant_1"), sdk.cart.add("variant_2"), sdk.cart.add("variant_3")]);
		expect(creates).toBe(1);
		expect(await storage.get("nce_cart")).toBe(CART);
		expect(calls.filter((c) => c.path.endsWith("/line-items"))).toHaveLength(3);
	});

	it("serializes writes so a slow earlier response can't overwrite a later one", async () => {
		let n = 0;
		const { sdk } = setup(async ({ url }) => {
			if (url.pathname.endsWith("/line-items")) {
				const mine = ++n;
				await new Promise((r) => setTimeout(r, mine === 1 ? 30 : 1)); // first request is slower
				return json(200, cartBody(CART, Array.from({ length: mine }, (_, i) => ({ id: `l${i}`, quantity: 1 }))));
			}
			return json(201, cartBody());
		}, { storage: { nce_cart: CART } });
		await Promise.all([sdk.cart.add("variant_a"), sdk.cart.add("variant_b")]);
		expect(sdk.cart.snapshot()?.items).toHaveLength(2);
	});

	it("replaces a stale cart (deleted or already paid) transparently on add", async () => {
		const { sdk, storage } = setup(({ url, method }) => {
			if (url.pathname === `/api/store/carts/${CART}/line-items`) return json(422, { error: { code: "not_allowed", message: "Cart is already completed" } });
			if (url.pathname === "/api/store/carts" && method === "POST") return json(201, cartBody(CART2));
			if (url.pathname === `/api/store/carts/${CART2}/line-items`) return json(200, cartBody(CART2, [{ id: "l1", quantity: 1 }]));
			return json(500, {});
		}, { storage: { nce_cart: CART } });
		const cart = await sdk.cart.add("variant_1");
		expect(cart.id).toBe(CART2);
		expect(await storage.get("nce_cart")).toBe(CART2);
	});

	it("does NOT drop the cart when only a line is missing", async () => {
		const { sdk, storage } = setup(() => json(404, { error: { code: "not_found", message: "Line item not found" } }), { storage: { nce_cart: CART } });
		await expect(sdk.cart.setQuantity("line_1", 2)).rejects.toMatchObject({ code: "not_found" });
		expect(await storage.get("nce_cart")).toBe(CART);
	});

	it("get(): completed or missing carts are cleared; malformed stored ids never reach the server", async () => {
		const done = setup(() => json(200, cartBody(CART, [], { completedAt: "2026-01-01" })), { storage: { nce_cart: CART } });
		expect(await done.sdk.cart.get()).toBeNull();
		expect(await done.storage.get("nce_cart")).toBeNull();

		const gone = setup(() => json(404, { error: { code: "not_found", message: "Cart not found" } }), { storage: { nce_cart: CART } });
		expect(await gone.sdk.cart.get()).toBeNull();

		const bad = setup(() => json(200, cartBody()), { storage: { nce_cart: "cart_../../admin" } });
		expect(await bad.sdk.cart.get()).toBeNull();
		expect(bad.calls).toHaveLength(0);
	});

	it("validates quantities locally and treats 0 as remove", async () => {
		const { sdk, calls } = setup(() => json(200, cartBody()), { storage: { nce_cart: CART } });
		await expect(sdk.cart.add("v", 0)).rejects.toMatchObject({ code: "invalid_data" });
		await expect(sdk.cart.add("v", 1.5)).rejects.toMatchObject({ code: "invalid_data" });
		await expect(sdk.cart.add("v", 101)).rejects.toMatchObject({ code: "invalid_data" });
		expect(calls).toHaveLength(0);
		await sdk.cart.setQuantity("line_1", 0);
		expect(calls[0]).toMatchObject({ method: "DELETE" });
	});

	it("encodes ids in paths (no route injection)", async () => {
		const { sdk, calls } = setup(() => json(200, cartBody()), { storage: { nce_cart: CART } });
		await sdk.cart.remove("../../x?y=1");
		expect(calls[0]!.path).toBe(`/api/store/carts/${CART}/line-items/..%2F..%2Fx%3Fy%3D1`);
	});

	it("notifies subscribers", async () => {
		const { sdk } = setup(() => json(201, cartBody(CART, [{ id: "l", quantity: 2 }])));
		const seen: unknown[] = [];
		const off = sdk.cart.subscribe((c) => seen.push(c?.id));
		await sdk.cart.add("v", 2);
		off();
		expect(seen.length).toBeGreaterThan(0);
	});
});

describe("http", () => {
	it("retries GETs on 503 with backoff, never retries POST", async () => {
		let gets = 0, posts = 0;
		const { sdk } = setup(({ method }) => {
			if (method === "GET") return ++gets < 3 ? json(503, { error: { code: "unexpected", message: "down" } }, { "retry-after": "0" }) : json(200, { products: [], count: 0, limit: 20, offset: 0 });
			posts++;
			return json(503, { error: { code: "unexpected", message: "down" } });
		});
		await expect(sdk.products.list()).resolves.toMatchObject({ count: 0 });
		expect(gets).toBe(3);
		await expect(sdk.cart.add("v")).rejects.toBeInstanceOf(CommerceError);
		expect(posts).toBe(1);
	});

	it("maps network errors, timeouts, HTML error pages and aborts", async () => {
		const net = setup(() => { throw new TypeError("Failed to fetch"); }, { retries: 0 });
		await expect(net.sdk.products.list()).rejects.toMatchObject({ code: "network_error" });

		const slow = setup(() => new Promise<Response>(() => {}), { retries: 0, timeoutMs: 20 });
		const fetchImpl = slow.fetch;
		fetchImpl.mockImplementation((_u, init) => new Promise((_r, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))));
		await expect(slow.sdk.products.list()).rejects.toMatchObject({ code: "timeout" });

		const html = setup(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }), { retries: 0 });
		await expect(html.sdk.products.list()).rejects.toMatchObject({ code: "unexpected", status: 502 });

		const ab = setup(() => new Promise<Response>(() => {}), { retries: 0 });
		ab.fetch.mockImplementation((_u, init) => new Promise((_r, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))));
		const c = new AbortController();
		const p = ab.sdk.products.list({}, { signal: c.signal });
		c.abort();
		await expect(p).rejects.toMatchObject({ code: "aborted" });
	});

	it("product.get returns null on 404; public calls send no Authorization", async () => {
		const { sdk, calls } = setup(() => json(404, { error: { code: "not_found", message: "Product not found" } }), { storage: { nce_token: "tok" } });
		expect(await sdk.products.get("nope")).toBeNull();
		expect(calls[0]!.headers.get("authorization")).toBeNull();
	});

	it("surfaces rate limits with retryAfter", async () => {
		const { sdk } = setup(() => json(429, { error: { code: "rate_limited", message: "slow down" } }, { "retry-after": "30" }), { storage: { nce_cart: CART } });
		const e = await sdk.cart.applyCode("X").catch((x) => x);
		expect(isCommerceError(e, "rate_limited")).toBe(true);
		expect(e.retryAfter).toBe(30);
	});
});

describe("auth", () => {
	it("captures the token from set-auth-token and sends it on customer calls", async () => {
		const { sdk, calls, storage } = setup(({ url }) => {
			if (url.pathname === "/api/auth/sign-in/email") return json(200, { user: { id: "u", email: "a@b.co", name: "A", emailVerified: true } }, { "set-auth-token": "tok123" });
			if (url.pathname === "/api/store/customers/me") return json(200, { customer: { id: "c", email: "a@b.co", firstName: null, lastName: null, phone: null } });
			return json(404, {});
		});
		const events: boolean[] = [];
		sdk.auth.onChange((s) => events.push(s));
		await sdk.auth.signIn({ email: " A@B.co ", password: "password1" });
		expect(calls[0]!.body).toMatchObject({ email: "a@b.co" });
		expect(await storage.get("nce_token")).toBe("tok123");
		await sdk.customer.me();
		expect(calls[1]!.headers.get("authorization")).toBe("Bearer tok123");
		expect(events).toEqual([true]);
	});

	it("maps Better Auth errors to stable codes", async () => {
		const { sdk } = setup(() => json(403, { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" }));
		await expect(sdk.auth.signIn({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "email_not_verified" });
		const bad = setup(() => json(401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }));
		await expect(bad.sdk.auth.signIn({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "invalid_credentials" });
		const origin = setup(() => json(403, { message: "Invalid origin" }));
		await expect(origin.sdk.auth.signIn({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "origin_not_allowed" });
	});

	it("expired token: 401 clears it and signals sign-out; customer.me returns null", async () => {
		const { sdk, storage } = setup(() => json(401, { error: { code: "unauthorized", message: "Sign in" } }), { storage: { nce_token: "old" } });
		const events: boolean[] = [];
		sdk.auth.onChange((s) => events.push(s));
		expect(await sdk.customer.me()).toBeNull();
		expect(await storage.get("nce_token")).toBeNull();
		expect(events).toEqual([false]);
	});

	it("sign-out clears locally even when offline", async () => {
		const { sdk, storage } = setup(() => { throw new TypeError("offline"); }, { storage: { nce_token: "t" } });
		await sdk.auth.signOut();
		expect(await storage.get("nce_token")).toBeNull();
	});

	it("validates sign-up input before calling the server", async () => {
		const { sdk, calls } = setup(() => json(200, {}));
		await expect(sdk.auth.signUp({ name: " ", email: "a@b.co", password: "longenough" })).rejects.toMatchObject({ code: "invalid_data" });
		await expect(sdk.auth.signUp({ name: "A", email: "nope", password: "longenough" })).rejects.toMatchObject({ code: "invalid_data" });
		await expect(sdk.auth.signUp({ name: "A", email: "a@b.co", password: "short" })).rejects.toMatchObject({ code: "weak_password" });
		expect(calls).toHaveLength(0);
	});
});

describe("checkout", () => {
	it("readiness lists what's missing", () => {
		const { sdk } = setup(() => json(200, {}));
		expect(sdk.checkout.readiness(null).missing).toEqual(["items", "email", "shipping_address"]);
		const c = cartBody(CART, [{ id: "l", quantity: 1, purchasable: false }], { email: "a@b.co", shippingAddress: { countryCode: "NG" } }).cart as never;
		expect(sdk.checkout.readiness(c).missing).toEqual(["unavailable_items", "shipping_option"]);
		expect(sdk.checkout.readiness(c, { shippingOptionsAvailable: false }).missing).toEqual(["unavailable_items"]);
	});

	it("pay is single-flight", async () => {
		let n = 0;
		const { sdk } = setup(async () => { n++; await new Promise((r) => setTimeout(r, 10)); return json(200, { paymentId: "p", redirectUrl: "https://pay", reference: "nce_x" }); }, { storage: { nce_cart: CART } });
		await Promise.all([sdk.checkout.pay("paystack", { redirect: false }), sdk.checkout.pay("paystack", { redirect: false })]);
		expect(n).toBe(1);
	});

	it("handleReturn validates params and clears the cart only on success", async () => {
		const { sdk, storage } = setup(() => json(200, {}), { storage: { nce_cart: CART } });
		expect(await sdk.checkout.handleReturn("https://shop.test/checkout/complete?status=failed&reference=nce_1")).toMatchObject({ status: "failed", orderId: null });
		expect(await storage.get("nce_cart")).toBe(CART);
		expect(await sdk.checkout.handleReturn("?status=hacked")).toMatchObject({ status: "error" });
		const ok = await sdk.checkout.handleReturn(new URLSearchParams({ status: "succeeded", order: "order_01ARZ3NDEKTSV4RRFFQ69G5FAV", number: "1042" }));
		expect(ok).toMatchObject({ status: "succeeded", orderNumber: 1042 });
		expect(await storage.get("nce_cart")).toBeNull();
		expect((await sdk.checkout.handleReturn("?status=succeeded&order=<script>&number=-1")).orderId).toBeNull();
	});
});

describe("money", () => {
	it("formats minor units, zero-decimal currencies and bad input", () => {
		expect(formatMoney(1250000, "NGN")).toBe("₦12,500.00");
		expect(formatMoney(1500, "XOF", "en-US")).toMatch(/1,500/);
		expect(formatMoney(null, "NGN")).toBe("");
		expect(formatMoney(100, "ZZZ1")).toBe("1 ZZZ1");
	});
});
