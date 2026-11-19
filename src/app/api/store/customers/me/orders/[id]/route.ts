import { route, preflight } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { requireStoreCustomer } from "@/server/store-api";
import { getCustomerOrder } from "@/modules/order/service";

export const OPTIONS = preflight;
export const GET = route<{ id: string }>(async (req, { id }) => {
	const c = await requireStoreCustomer(req);
	const order = await getCustomerOrder(c.id, id); // scoped by customer → no IDOR
	if (!order) throw notFound("Order");
	return { order };
});
