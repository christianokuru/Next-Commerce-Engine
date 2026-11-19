import { z } from "zod";
import { route, preflight, body } from "@/lib/http";
import { address } from "@/lib/validators";
import { requireStoreCustomer } from "@/server/store-api";
import { addAddress, listAddresses } from "@/modules/customer/service";

export const OPTIONS = preflight;
export const GET = route(async (req) => ({ addresses: await listAddresses((await requireStoreCustomer(req)).id) }));
export const POST = route(async (req) => {
	const c = await requireStoreCustomer(req);
	const { isDefault, ...a } = await body(req, address.extend({ isDefault: z.boolean().optional() }));
	return { id: await addAddress(c.id, a, isDefault) };
});
