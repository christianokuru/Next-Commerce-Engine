import { route, preflight } from "@/lib/http";
import { cached, CacheTags } from "@/lib/cache";
import { listCollections } from "@/modules/product/service";

export const OPTIONS = preflight;
export const GET = route(async () => ({ collections: await cached(CacheTags.catalog, "collections", 600, listCollections) }));
