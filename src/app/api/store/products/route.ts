import { z } from "zod";
import { route, preflight, json } from "@/lib/http";
import { cached, CacheTags } from "@/lib/cache";
import { listStoreProducts } from "@/queries/catalog";
import { resolveCurrency } from "@/server/store-api";

const query = z.object({
	q: z.string().max(100).optional(),
	category: z.string().max(100).optional(),
	collection: z.string().max(100).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export const OPTIONS = preflight;
export const GET = route(async (req) => {
	const currency = await resolveCurrency(req);
	const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
	const key = JSON.stringify([currency, p.q, p.category, p.collection, p.limit, p.offset]);
	const data = await cached(CacheTags.catalog, `products:${key}`, 300, () =>
		listStoreProducts({ currency, q: p.q, categoryHandle: p.category, collectionHandle: p.collection, limit: p.limit, offset: p.offset }),
	);
	return json(req, data, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
});
