import { z } from "zod";
import { route, preflight } from "@/lib/http";
import { requireStoreCustomer } from "@/server/store-api";
import { listOrders } from "@/modules/order/service";

const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).default(0) });

export const OPTIONS = preflight;
export const GET = route(async (req) => {
	const c = await requireStoreCustomer(req);
	const { limit, offset } = q.parse(Object.fromEntries(new URL(req.url).searchParams));
	return listOrders({ customerId: c.id, limit, offset });
});
