import { AuthApi } from "./auth.js";
import { CartApi } from "./cart.js";
import { CommerceError, isCommerceError } from "./errors.js";
import { Http, seg, type RequestOptions } from "./http.js";
import { defaultStorage, type StorageAdapter } from "./storage.js";
import type {
	Address, Cart, Category, Collection, Customer, CustomerAddress, Feature, Order, OrderList,
	PaymentSession, Product, ProductList, StoreConfig, StoreSettings,
} from "./types.js";

export type CommerceOptions = {
	/** The engine's URL, e.g. "https://admin.clientbrand.com". */
	baseUrl: string;
	/** Where cart id / token / currency are kept. Default: first-party cookies in the browser, memory on the server. */
	storage?: StorageAdapter;
	/** "token" (default, works across domains) or "cookie" (storefront + engine on the same site). */
	auth?: "token" | "cookie";
	/** Key prefix in storage. Change it if two stores share one domain. */
	storageKey?: string;
	fetch?: typeof fetch;
	/** Per request. Default 15s. */
	timeoutMs?: number;
	/** Retries for safe (GET) requests on network errors, timeouts, 429 and 5xx. Default 2. Writes are never retried. */
	retries?: number;
};

type Fetch = Pick<RequestOptions, "signal" | "init">;

/** Small TTL cache with in-flight de-duplication (settings/config are read by many components). */
function memo<T>(ttlMs: number, load: () => Promise<T>) {
	let value: { v: T; at: number } | null = null;
	let pending: Promise<T> | null = null;
	const get = (force = false): Promise<T> => {
		if (!force && value && Date.now() - value.at < ttlMs) return Promise.resolve(value.v);
		return (pending ??= load().then((v) => { value = { v, at: Date.now() }; return v; }).finally(() => { pending = null; }));
	};
	return Object.assign(get, { clear: () => { value = null; } });
}

export function createCommerce(options: CommerceOptions) {
	if (!/^https?:\/\//.test(options.baseUrl ?? "")) throw new CommerceError("invalid_data", "createCommerce: baseUrl must be an absolute http(s) URL");
	const storage = options.storage ?? defaultStorage();
	const prefix = options.storageKey ?? "nce";
	const keys = { cart: `${prefix}_cart`, token: `${prefix}_token`, currency: `${prefix}_currency` };
	const mode = options.auth ?? "token";
	const fetchImpl = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));

	const authRef: { current?: AuthApi } = {};
	const tokens = {
		get: async () => (mode === "token" ? (await storage.get(keys.token)) || null : null),
		set: async (t: string) => { if (mode === "token") await storage.set(keys.token, t); },
		clear: async () => { await storage.remove(keys.token); },
	};

	const http = new Http({
		baseUrl: options.baseUrl.replace(/\/+$/, ""),
		fetch: fetchImpl,
		timeoutMs: options.timeoutMs ?? 15_000,
		retries: options.retries ?? 2,
		credentials: mode === "cookie" ? "include" : "omit",
		getToken: tokens.get,
		onToken: tokens.set,
		onUnauthorized: async () => {
			if (mode === "token" && (await tokens.get())) { await tokens.clear(); authRef.current?.emit(false); }
		},
	});

	const auth = (authRef.current = new AuthApi(http, tokens, mode));

	const settings = memo(60_000, () => http.request<StoreSettings>("/api/store/settings"));
	const config = memo(60_000, () => http.request<StoreConfig>("/api/store/config"));

	const currency = {
		/** Shopper's chosen currency, if any (else the store default applies). */
		get: async () => ((await storage.get(keys.currency)) || undefined)?.toUpperCase(),
		/** Remember a currency and move the cart to it. Returns items that aren't sold in that currency. */
		set: async (code: string) => {
			const c = code.trim().toUpperCase();
			const s = await settings();
			if (!s.currencies.includes(c)) throw new CommerceError("invalid_data", `${c} is not available in this store`);
			await storage.set(keys.currency, c);
			return cart.changeCurrency(c);
		},
	};

	const cart = new CartApi(http, storage, keys.cart, currency.get);

	const notFoundToNull = async <T>(p: Promise<T>): Promise<T | null> => {
		try { return await p; } catch (e) { if (isCommerceError(e, "not_found")) return null; throw e; }
	};

	return {
		http,
		store: {
			settings: (o: { fresh?: boolean } = {}) => settings(o.fresh),
			/** Features this store has. Out-of-plan features are simply absent. */
			config: (o: { fresh?: boolean } = {}) => config(o.fresh),
			hasFeature: async (f: Feature) => (await config()).features.includes(f),
		},

		currency,

		products: {
			list: async (q: { q?: string; category?: string; collection?: string; limit?: number; offset?: number; currency?: string } = {}, o: Fetch = {}) =>
				http.request<ProductList>("/api/store/products", {
					query: {
						q: q.q?.trim().slice(0, 100), category: q.category, collection: q.collection,
						limit: q.limit === undefined ? undefined : Math.min(100, Math.max(1, Math.floor(q.limit))),
						offset: q.offset === undefined ? undefined : Math.min(10_000, Math.max(0, Math.floor(q.offset))),
						currency: q.currency ?? (await currency.get()),
					},
					...o,
				}),
			/** null when the product doesn't exist or isn't published. */
			get: async (handle: string, q: { currency?: string } = {}, o: Fetch = {}) =>
				notFoundToNull(
					http.request<{ product: Product }>(`/api/store/products/${seg(handle)}`, { query: { currency: q.currency ?? (await currency.get()) }, ...o }).then((r) => r.product),
				),
		},

		categories: { list: (o: Fetch = {}) => http.request<{ categories: Category[] }>("/api/store/categories", o).then((r) => r.categories) },
		collections: {
			list: (o: Fetch = {}) => notFoundToNull(http.request<{ collections: Collection[] }>("/api/store/collections", o).then((r) => r.collections)).then((c) => c ?? []),
		},

		cart,

		checkout: {
			/** What's still missing before payment (for step UIs). Server re-checks everything. */
			readiness(c: Cart | null | undefined, opts: { shippingOptionsAvailable?: boolean } = {}) {
				const missing: ("items" | "unavailable_items" | "email" | "shipping_address" | "shipping_option" | "promotion")[] = [];
				if (!c || !c.items.length) missing.push("items");
				if (c?.items.some((i) => !i.purchasable)) missing.push("unavailable_items");
				if (!c?.email) missing.push("email");
				if (!c?.shippingAddress) missing.push("shipping_address");
				if (c?.shippingAddress && !c.shippingOption && opts.shippingOptionsAvailable !== false) missing.push("shipping_option");
				if (c?.promotion && c.totals.promotionError) missing.push("promotion");
				return { ready: missing.length === 0, missing };
			},

			/**
			 * Start payment and (in the browser) go to the provider's secure page.
			 * Double clicks are safe: one request in flight, and the engine reuses an open payment session.
			 * `returnUrl` receives `?status=…&order=…&number=…`; `cancelUrl` is used if the shopper backs out.
			 */
			pay: (() => {
				let inFlight: Promise<PaymentSession> | null = null;
				return (provider: string, o: { returnUrl?: string; cancelUrl?: string; redirect?: boolean } = {}) =>
					(inFlight ??= (async () => {
						const id = await cart.id();
						if (!id) throw new CommerceError("not_found", "Your cart is empty");
						const session = await http.request<PaymentSession>(`/api/store/carts/${seg(id)}/payment`, {
							method: "POST", auth: true, body: { provider, ...(o.returnUrl ? { returnUrl: o.returnUrl } : {}), ...(o.cancelUrl ? { cancelUrl: o.cancelUrl } : {}) },
						});
						if (o.redirect !== false && typeof window !== "undefined") window.location.assign(session.redirectUrl);
						return session;
					})().finally(() => { inFlight = null; }));
			})(),

			/**
			 * Read the result the engine appended to your returnUrl. Only `succeeded` means an order exists;
			 * it also clears the local cart. Treat it as display info: the engine has already verified the payment.
			 */
			async handleReturn(input: string | URL | URLSearchParams) {
				const p = input instanceof URLSearchParams ? input : new URL(String(input), "http://x").searchParams;
				const known = ["succeeded", "pending", "failed", "requires_action", "canceled", "invalid", "error"] as const;
				const raw = p.get("status") ?? "";
				const status = (known as readonly string[]).includes(raw) ? (raw as (typeof known)[number]) : "error";
				const orderId = p.get("order");
				const number = Number(p.get("number"));
				const result = {
					status,
					orderId: status === "succeeded" && orderId && /^order_[0-9A-Z]{26}$/.test(orderId) ? orderId : null,
					orderNumber: status === "succeeded" && Number.isInteger(number) && number > 0 ? number : null,
					reference: p.get("reference"),
				};
				if (status === "succeeded") await cart.reset();
				return result;
			},
		},

		auth,

		customer: {
			/** null when signed out (or accounts are off for this store). */
			me: async (o: Fetch = {}) => {
				if (!(await auth.hasToken())) return null;
				try {
					return (await http.request<{ customer: Customer }>("/api/store/customers/me", { auth: true, ...o })).customer;
				} catch (e) {
					if (isCommerceError(e, "unauthorized") || isCommerceError(e, "not_found")) return null;
					throw e;
				}
			},
			update: async (patch: { firstName?: string | null; lastName?: string | null; phone?: string | null }) =>
				(await http.request<{ customer: Customer }>("/api/store/customers/me", { method: "PATCH", auth: true, body: patch })).customer,
			orders: {
				list: (q: { limit?: number; offset?: number } = {}, o: Fetch = {}) =>
					http.request<OrderList>("/api/store/customers/me/orders", { auth: true, query: q, ...o }),
				get: (id: string, o: Fetch = {}) =>
					notFoundToNull(http.request<{ order: Order }>(`/api/store/customers/me/orders/${seg(id)}`, { auth: true, ...o }).then((r) => r.order)),
			},
			addresses: {
				list: async (o: Fetch = {}) => (await http.request<{ addresses: CustomerAddress[] }>("/api/store/customers/me/addresses", { auth: true, ...o })).addresses,
				add: async (address: Address, opts: { isDefault?: boolean } = {}) =>
					(await http.request<{ id: string }>("/api/store/customers/me/addresses", { method: "POST", auth: true, body: { ...address, isDefault: opts.isDefault } })).id,
				remove: async (id: string) => {
					await http.request(`/api/store/customers/me/addresses/${seg(id)}`, { method: "DELETE", auth: true });
				},
			},
		},
	};
}

export type Commerce = ReturnType<typeof createCommerce>;
