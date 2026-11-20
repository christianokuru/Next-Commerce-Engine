import { CommerceError, isCommerceError } from "./errors.js";
import { type Http, seg } from "./http.js";
import type { StorageAdapter } from "./storage.js";
import type { Address, Cart, PaymentProvider, ShippingOption } from "./types.js";

type Listener = (cart: Cart | null) => void;

export const MAX_QUANTITY = 100;
const CART_ID = /^cart_[0-9A-Z]{26}$/;

/** The stored cart is unusable (deleted, purged, already paid) → start a fresh one. */
export function isStaleCartError(e: unknown) {
	return (
		isCommerceError(e) &&
		((e.code === "not_found" && /^cart not found/i.test(e.message)) ||
			(e.code === "not_allowed" && /already completed/i.test(e.message)))
	);
}

const badQty = (q: number, min: number) =>
	!Number.isInteger(q) || q < min || q > MAX_QUANTITY
		? Promise.reject(new CommerceError("invalid_data", `Quantity must be a whole number from ${min} to ${MAX_QUANTITY}`))
		: null;

/**
 * Cart with the edge cases handled:
 * - created lazily on the first add (browsing never creates carts or hits rate limits)
 * - one cart even under double-clicks / parallel adds (single-flight creation + serialized writes)
 * - a stale stored cart (deleted, already paid) is dropped and replaced transparently
 * - every write returns the full cart; subscribers (UI, other tabs) get it
 */
export class CartApi {
	private listeners = new Set<Listener>();
	private current: Cart | null | undefined = undefined; // undefined = not loaded yet
	private writeQueue: Promise<unknown> = Promise.resolve();
	private creating: Promise<string> | null = null;
	private loading: Promise<Cart | null> | null = null;
	private version = 0;
	private channel: BroadcastChannel | null = null;

	constructor(
		private http: Http,
		private storage: StorageAdapter,
		private key: string,
		private currency: () => Promise<string | undefined>,
	) {
		// Cross-tab sync is a browser concern; in Node/Workers a channel would also keep the process alive.
		if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
			try {
				this.channel = new BroadcastChannel(`${key}:sync`);
				this.channel.onmessage = (ev: MessageEvent<{ cart: Cart | null }>) => this.publish(ev.data.cart, false);
			} catch { this.channel = null; }
		}
	}

	/** Last known cart (undefined until first load). For useSyncExternalStore. */
	snapshot = () => this.current;

	subscribe = (fn: Listener) => {
		this.listeners.add(fn);
		return () => void this.listeners.delete(fn);
	};

	private publish(cart: Cart | null, broadcast = true) {
		this.version++;
		this.current = cart;
		for (const l of this.listeners) l(cart);
		if (broadcast) try { this.channel?.postMessage({ cart }); } catch { /* closed */ }
	}

	/** Stored cart id; a malformed/tampered value is discarded instead of breaking every request. */
	async id(): Promise<string | null> {
		const v = (await this.storage.get(this.key)) || null;
		if (v && !CART_ID.test(v)) {
			await this.storage.remove(this.key);
			return null;
		}
		return v;
	}

	/** Forget the cart locally (e.g. after a successful order). Does not delete it on the server. */
	async reset() {
		await this.storage.remove(this.key);
		this.publish(null);
	}

	/** Load the current cart, or null if there isn't one. Concurrent calls share one request. */
	async get(opts: { signal?: AbortSignal } = {}): Promise<Cart | null> {
		if (this.loading) return this.loading;
		const startVersion = this.version;
		this.loading = (async () => {
			const id = await this.id();
			if (!id) {
				if (this.version === startVersion) this.publish(null, false);
				return null;
			}
			try {
				const { cart } = await this.http.request<{ cart: Cart }>(`/api/store/carts/${seg(id)}`, { signal: opts.signal });
				if (cart.completedAt) {
					await this.storage.remove(this.key);
					if (this.version === startVersion) this.publish(null, false);
					return null;
				}
				// A write that finished while we were loading is newer: keep it.
				if (this.version === startVersion) this.publish(cart, false);
				return this.current ?? cart;
			} catch (e) {
				if (isCommerceError(e, "not_found") || isStaleCartError(e)) {
					await this.storage.remove(this.key);
					if (this.version === startVersion) this.publish(null, false);
					return null;
				}
				throw e;
			}
		})().finally(() => { this.loading = null; });
		return this.loading;
	}

	/** Create a cart explicitly (normally not needed: `add` creates one). */
	async create(input: { email?: string; currencyCode?: string } = {}): Promise<Cart> {
		const { cart } = await this.http.request<{ cart: Cart }>("/api/store/carts", {
			method: "POST",
			auth: true, // links the cart to a signed-in customer
			body: { currencyCode: input.currencyCode ?? (await this.currency()), ...(input.email ? { email: input.email } : {}) },
		});
		await this.storage.set(this.key, cart.id);
		this.publish(cart);
		return cart;
	}

	private ensureId(): Promise<string> {
		return (this.creating ??= (async () => {
			const existing = await this.id();
			if (existing) return existing;
			return (await this.create()).id;
		})().finally(() => { this.creating = null; }));
	}

	/** Run writes one at a time, in order, so responses can't overwrite each other out of order. */
	private serialize<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.writeQueue.then(fn, fn);
		this.writeQueue = run.catch(() => undefined);
		return run;
	}

	private write(path: (id: string) => string, method: "POST" | "PATCH" | "DELETE", body?: unknown, opts: { createIfMissing?: boolean } = {}): Promise<Cart> {
		return this.serialize(async () => {
			const attempt = async (id: string) => {
				const { cart } = await this.http.request<{ cart: Cart }>(path(id), { method, body, auth: true });
				this.publish(cart);
				return cart;
			};
			const id = opts.createIfMissing ? await this.ensureId() : await this.id();
			if (!id) throw new CommerceError("not_found", "Your cart is empty");
			try {
				return await attempt(id);
			} catch (e) {
				if (!isStaleCartError(e)) throw e;
				await this.storage.remove(this.key);
				this.publish(null);
				if (!opts.createIfMissing) throw new CommerceError("not_found", "Your cart has expired. Please add the items again.", { cause: e });
				return attempt(await this.ensureId()); // add to a fresh cart, once
			}
		});
	}

	add(variantId: string, quantity = 1): Promise<Cart> {
		const bad = badQty(quantity, 1);
		if (bad) return bad;
		return this.write((id) => `/api/store/carts/${seg(id)}/line-items`, "POST", { variantId, quantity }, { createIfMissing: true });
	}

	/** Set a line's quantity; 0 removes it. */
	setQuantity(lineId: string, quantity: number): Promise<Cart> {
		const bad = badQty(quantity, 0);
		if (bad) return bad;
		if (quantity === 0) return this.remove(lineId);
		return this.write((id) => `/api/store/carts/${seg(id)}/line-items/${seg(lineId)}`, "PATCH", { quantity });
	}

	remove(lineId: string): Promise<Cart> {
		return this.write((id) => `/api/store/carts/${seg(id)}/line-items/${seg(lineId)}`, "DELETE");
	}

	/** Email and addresses. Pass `billingAddress: null` to use the shipping address. */
	update(input: { email?: string; shippingAddress?: Address; billingAddress?: Address | null }): Promise<Cart> {
		const body = { ...input, ...(input.email !== undefined ? { email: input.email.trim() } : {}) };
		return this.write((id) => `/api/store/carts/${seg(id)}`, "POST", body, { createIfMissing: true });
	}

	/** Shipping methods for the cart's address (empty until an address is set). */
	async shippingOptions(): Promise<ShippingOption[]> {
		const id = await this.id();
		if (!id) return [];
		return (await this.http.request<{ shippingOptions: ShippingOption[] }>(`/api/store/carts/${seg(id)}/shipping-options`)).shippingOptions;
	}

	setShippingOption(optionId: string): Promise<Cart> {
		return this.write((id) => `/api/store/carts/${seg(id)}/shipping-method`, "POST", { optionId });
	}

	applyCode(code: string): Promise<Cart> {
		const c = code.trim();
		if (!c) return Promise.reject(new CommerceError("invalid_data", "Enter a discount code"));
		return this.write((id) => `/api/store/carts/${seg(id)}/promotion`, "POST", { code: c });
	}

	removeCode(): Promise<Cart> {
		return this.write((id) => `/api/store/carts/${seg(id)}/promotion`, "DELETE");
	}

	/** Payment providers usable for this cart's currency. */
	async paymentProviders(): Promise<PaymentProvider[]> {
		const id = await this.id();
		if (!id) return [];
		return (await this.http.request<{ providers: PaymentProvider[] }>(`/api/store/carts/${seg(id)}/payment`)).providers;
	}

	/**
	 * Move the cart to another currency. Carts are priced in one currency, so this creates a new cart and
	 * re-adds each item; items not sold in the new currency are returned in `dropped`.
	 */
	async changeCurrency(currencyCode: string): Promise<{ cart: Cart | null; dropped: string[] }> {
		const old = await this.get();
		if (!old || old.currencyCode === currencyCode.toUpperCase()) return { cart: old, dropped: [] };
		return this.serialize(async () => {
			const { cart: fresh } = await this.http.request<{ cart: Cart }>("/api/store/carts", {
				method: "POST", auth: true, body: { currencyCode, ...(old.email ? { email: old.email } : {}) },
			});
			let cart = fresh;
			const dropped: string[] = [];
			for (const line of old.items) {
				try {
					cart = (await this.http.request<{ cart: Cart }>(`/api/store/carts/${seg(fresh.id)}/line-items`, {
						method: "POST", auth: true, body: { variantId: line.variantId, quantity: line.quantity },
					})).cart;
				} catch {
					dropped.push(line.title);
				}
			}
			if (old.shippingAddress)
				cart = (await this.http.request<{ cart: Cart }>(`/api/store/carts/${seg(fresh.id)}`, { method: "POST", auth: true, body: { shippingAddress: old.shippingAddress } }).catch(() => ({ cart }))).cart;
			await this.storage.set(this.key, fresh.id);
			this.publish(cart);
			return { cart, dropped };
		});
	}

	/** Item count for badges. */
	static count(cart: Cart | null | undefined) {
		return cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
	}
}
