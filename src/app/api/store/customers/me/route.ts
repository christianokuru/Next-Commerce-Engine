import { z } from "zod";
import { route, preflight, body } from "@/lib/http";
import { requireStoreCustomer } from "@/server/store-api";
import { updateCustomer } from "@/modules/customer/service";

const pick = (c: Awaited<ReturnType<typeof requireStoreCustomer>>) => ({ id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName, phone: c.phone });

export const OPTIONS = preflight;
export const GET = route(async (req) => ({ customer: pick(await requireStoreCustomer(req)) }));
export const PATCH = route(async (req) => {
	const c = await requireStoreCustomer(req);
	const input = await body(req, z.object({ firstName: z.string().trim().max(100).nullish(), lastName: z.string().trim().max(100).nullish(), phone: z.string().trim().max(30).nullish() }));
	return { customer: pick(await updateCustomer(c.id, input)) };
});
