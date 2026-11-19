import { z } from "zod";
import { route, preflight, body } from "@/lib/http";
import { address, email, id } from "@/lib/validators";
import { retrieveCart, updateCart } from "@/modules/cart/service";
import { optionalCustomer, serializeCart } from "@/server/store-api";

const cartId = id("cart");
const schema = z.object({ email: email.optional(), shippingAddress: address.optional(), billingAddress: address.nullable().optional() });

export const OPTIONS = preflight;
export const GET = route<{ id: string }>(async (_req, p) => ({ cart: serializeCart(await retrieveCart(cartId.parse(p.id))) }));
export const POST = route<{ id: string }>(async (req, p) => {
	const input = await body(req, schema);
	const customer = await optionalCustomer(req);
	return { cart: serializeCart(await updateCart(cartId.parse(p.id), { ...input, ...(customer ? { customerId: customer.id } : {}) })) };
});
