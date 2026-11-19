import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { categoryUpdate } from "@/server/admin-schemas";
import { deleteCategory, updateCategory } from "@/modules/product/service";

type P = { id: string };
export const PATCH = adminRoute<P>(async (req, { params }) => { await updateCategory(params.id, await body(req, categoryUpdate)); return { ok: true }; });
export const DELETE = adminRoute<P>(async (_req, { params }) => { await deleteCategory(params.id); return { deleted: true }; });
