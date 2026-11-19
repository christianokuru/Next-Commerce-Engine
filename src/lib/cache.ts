import { bindings } from "./env";

/**
 * Small read-through cache on Cloudflare KV with tag-versioned keys.
 * Only used for public, non-price-critical reads (store settings, catalog listing).
 * Checkout/cart totals ALWAYS read from Postgres.
 */
type Kv = KVNamespace;

function kv(): Kv | undefined {
	return (bindings() as { CACHE?: Kv }).CACHE;
}

async function tagVersion(store: Kv, tag: string) {
	return (await store.get(`tagv:${tag}`, { cacheTtl: 60 })) ?? "0";
}

export async function cached<T>(tag: string, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
	const store = kv();
	if (!store) return load();
	try {
		const v = await tagVersion(store, tag);
		const fullKey = `c:${tag}:${v}:${key}`;
		const hit = await store.get<T>(fullKey, { type: "json", cacheTtl: 60 });
		if (hit !== null) return hit;
		const value = await load();
		await store.put(fullKey, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSeconds) });
		return value;
	} catch (e) {
		console.error("cache error", e);
		return load();
	}
}

/** Invalidate everything under a tag by bumping its version. */
export async function invalidate(...tags: string[]) {
	const store = kv();
	if (!store) return;
	await Promise.all(
		tags.map((t) => store.put(`tagv:${t}`, Date.now().toString(36)).catch((e) => console.error("invalidate", e))),
	);
}

export const CacheTags = { settings: "settings", catalog: "catalog" } as const;
