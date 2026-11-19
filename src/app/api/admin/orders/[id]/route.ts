import { adminRoute } from "@/server/admin-api";
import { getOrderDetail } from "@/queries/admin";
import { notFound } from "@/lib/errors";

export const GET = adminRoute<{ id: string }>(async (_req, { params }) => {
	const order = await getOrderDetail(params.id);
	if (!order) throw notFound("Order");
	return { order };
});
