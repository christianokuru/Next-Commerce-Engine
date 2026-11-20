import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { collectionCreate } from "@/server/admin-schemas";
import { createCollection, listCollections } from "@/modules/product/service";

export const GET = adminRoute(async () => ({ collections: await listCollections() }), { feature: "collections" });
export const POST = adminRoute(async (req) => ({ id: await createCollection(await body(req, collectionCreate)) }), { feature: "collections" });
