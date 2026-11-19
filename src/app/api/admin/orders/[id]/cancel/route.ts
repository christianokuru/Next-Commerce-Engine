import { adminRoute, actorId } from "@/server/admin-api";
import { body } from "@/lib/http";
import { cancel } from "@/server/admin-schemas";
import { cancelOrder } from "@/workflows/order";

export const POST = adminRoute<{ id: string }>(async (req, { params, actor }) => {
	const { restock } = await body(req, cancel);
	return { order: await cancelOrder(params.id, actorId(actor), { restock }) };
});
