import { adminRoute, actorId } from "@/server/admin-api";
import { body } from "@/lib/http";
import { refund } from "@/server/admin-schemas";
import { refundOrder } from "@/workflows/order";

export const POST = adminRoute<{ id: string }>(async (req, { params, actor }) => {
	const i = await body(req, refund);
	return { refund: await refundOrder(params.id, i.amount, { reason: i.reason, actorId: actorId(actor) }) };
});
