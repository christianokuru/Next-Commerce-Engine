import { route, preflight } from "@/lib/http";
import { cached, CacheTags } from "@/lib/cache";
import { listCategories } from "@/modules/product/service";

export const OPTIONS = preflight;
export const GET = route(async () => {
	const rows = await cached(CacheTags.catalog, "categories", 600, () => listCategories({ activeOnly: true }));
	return { categories: rows.map(({ id, name, handle, description, parentId }) => ({ id, name, handle, description, parentId })) };
});
