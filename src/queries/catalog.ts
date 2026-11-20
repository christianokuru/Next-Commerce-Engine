/** Public catalog reads for the Store API: product module + stock availability from inventory. */
import * as product from "@/modules/product/service";
import * as inventory from "@/modules/inventory/service";
import { hasFeature } from "@/lib/plan";

type Items = Awaited<ReturnType<typeof inventory.getItems>>;

/** Strip internal fields; expose only the requested currency and availability (never stock counts). */
function toStoreProduct(p: product.CatalogProduct, currency: string, items: Items) {
	const cur = currency.toUpperCase();
	return {
		id: p.id, title: p.title, handle: p.handle, subtitle: p.subtitle, description: p.description, thumbnail: p.thumbnail,
		images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
		options: p.options.map((o) => ({ title: o.title, values: o.values })),
		variants: p.variants.map((v) => {
			const price = v.prices.find((x) => x.currencyCode === cur);
			return {
				id: v.id, title: v.title, sku: v.sku, options: v.options,
				price: price ? { amount: price.amount, compareAtAmount: price.compareAtAmount, currencyCode: cur } : null,
				inStock: !hasFeature("inventoryTracking") || inventory.isSellable(items.get(v.id)),
			};
		}),
	};
}

export async function listStoreProducts(opts: Parameters<typeof product.listPublished>[0] & { currency: string }) {
	const r = await product.listPublished(opts);
	const items = await inventory.getItems(r.products.flatMap((p) => p.variants.map((v) => v.id)));
	return { ...r, products: r.products.map((p) => toStoreProduct(p, opts.currency, items)) };
}

export async function getStoreProduct(handle: string, currency: string) {
	const p = await product.getPublishedByHandle(handle);
	if (!p) return null;
	return toStoreProduct(p, currency, await inventory.getItems(p.variants.map((v) => v.id)));
}
