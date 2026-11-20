import { adminRoute, actorId } from "@/server/admin-api";
import { body } from "@/lib/http";
import { stockChange } from "@/server/admin-schemas";
import { adjustStock, setStock } from "@/modules/inventory/service";
import { variantsExist } from "@/modules/product/service";
import { notFound } from "@/lib/errors";

export const POST = adminRoute<{ variantId: string }>(async (req, { params, actor }) => {
	const i = await body(req, stockChange);
	if (!(await variantsExist([params.variantId])).size) throw notFound("Variant");
	const item = i.mode === "set"
		? await setStock(params.variantId, i.quantity, actorId(actor))
		: await adjustStock(params.variantId, i.quantity, { reason: "restock", actorId: actorId(actor), note: i.note });
	return { item };
}, { feature: "inventoryTracking" });
