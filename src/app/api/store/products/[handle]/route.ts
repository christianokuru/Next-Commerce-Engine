import { route, preflight, json } from "@/lib/http";
import { cached, CacheTags } from "@/lib/cache";
import { notFound } from "@/lib/errors";
import { getPublishedProductByHandle } from "@/modules/product/service";
import { resolveCurrency } from "@/server/store-api";

export const OPTIONS = preflight;
export const GET = route<{ handle: string }>(async (req, { handle }) => {
	const currency = await resolveCurrency(req);
	const product = await cached(CacheTags.catalog, `product:${currency}:${handle}`, 300, () => getPublishedProductByHandle(handle, currency));
	if (!product) throw notFound("Product");
	return json(req, { product }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
});
