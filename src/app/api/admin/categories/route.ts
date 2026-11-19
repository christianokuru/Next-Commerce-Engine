import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { categoryCreate } from "@/server/admin-schemas";
import { createCategory, listCategories } from "@/modules/product/service";

export const GET = adminRoute(async () => ({ categories: await listCategories() }));
export const POST = adminRoute(async (req) => ({ id: await createCategory(await body(req, categoryCreate)) }));
