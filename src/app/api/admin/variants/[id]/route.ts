import { adminRoute, actorId } from "@/server/admin-api";
import { body } from "@/lib/http";
import { variantUpdate } from "@/server/admin-schemas";
import { updateVariant, deleteVariant } from "@/workflows/catalog";

type P = { id: string };
export const PATCH = adminRoute<P>(async (req, { params, actor }) => {
	await updateVariant(params.id, await body(req, variantUpdate), actorId(actor));
	return { ok: true };
});
export const DELETE = adminRoute<P>(async (_req, { params }) => {
	await deleteVariant(params.id);
	return { deleted: true };
});
