"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { CartApi } from "./cart.js";
import type { Commerce } from "./client.js";
import type { CommerceError } from "./errors.js";
import type { Cart, Customer, StoreConfig } from "./types.js";

const Ctx = createContext<Commerce | null>(null);

export function CommerceProvider({ client, children }: { client: Commerce; children: ReactNode }) {
	return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useCommerce(): Commerce {
	const c = useContext(Ctx);
	if (!c) throw new Error("useCommerce must be used inside <CommerceProvider>");
	return c;
}

/**
 * Live cart for the whole app (and other tabs). `cart` is undefined while loading, null when empty.
 * Actions return the updated cart and throw CommerceError (catch it to show a message).
 */
export function useCart() {
	const client = useCommerce();
	const cart = useSyncExternalStore(client.cart.subscribe, client.cart.snapshot, () => undefined);
	const [error, setError] = useState<CommerceError | null>(null);
	const [pending, setPending] = useState(0);

	useEffect(() => {
		if (client.cart.snapshot() === undefined) client.cart.get().catch((e) => setError(e));
	}, [client]);

	const run = useCallback(
		async <T,>(fn: () => Promise<T>): Promise<T> => {
			setPending((n) => n + 1);
			setError(null);
			try {
				return await fn();
			} catch (e) {
				setError(e as CommerceError);
				throw e;
			} finally {
				setPending((n) => n - 1);
			}
		},
		[],
	);

	return useMemo(
		() => ({
			cart: cart as Cart | null | undefined,
			count: CartApi.count(cart),
			loading: cart === undefined,
			/** True while any cart action is running. */
			pending: pending > 0,
			error,
			clearError: () => setError(null),
			add: (variantId: string, quantity = 1) => run(() => client.cart.add(variantId, quantity)),
			setQuantity: (lineId: string, quantity: number) => run(() => client.cart.setQuantity(lineId, quantity)),
			remove: (lineId: string) => run(() => client.cart.remove(lineId)),
			update: (input: Parameters<Commerce["cart"]["update"]>[0]) => run(() => client.cart.update(input)),
			setShippingOption: (id: string) => run(() => client.cart.setShippingOption(id)),
			applyCode: (code: string) => run(() => client.cart.applyCode(code)),
			removeCode: () => run(() => client.cart.removeCode()),
			refresh: () => run(() => client.cart.get()),
		}),
		[cart, pending, error, client, run],
	);
}

/** Signed-in customer. `customer` is undefined while loading, null when signed out. */
export function useCustomer() {
	const client = useCommerce();
	const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
	const load = useCallback(() => client.customer.me().then(setCustomer, () => setCustomer(null)), [client]);
	useEffect(() => {
		load();
		return client.auth.onChange(() => void load());
	}, [client, load]);
	return { customer, loading: customer === undefined, signedIn: Boolean(customer), refresh: load };
}

/** Store features (e.g. hide sign-in when "customerAccounts" is off). */
export function useStoreConfig() {
	const client = useCommerce();
	const [config, setConfig] = useState<StoreConfig | null>(null);
	useEffect(() => {
		let live = true;
		client.store.config().then((c) => live && setConfig(c), () => live && setConfig({ region: "africa", features: [] }));
		return () => { live = false; };
	}, [client]);
	return { config, has: (f: string) => Boolean(config?.features.includes(f)) };
}
