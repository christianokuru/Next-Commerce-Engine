import { z } from "zod";
import { route, preflight, body, rateLimit, json } from "@/lib/http";
import { currency, email } from "@/lib/validators";
import { createCart, retrieveCart } from "@/modules/cart/service";
import { optionalCustomer, serializeCart } from "@/server/store-api";

const schema = z.object({ currencyCode: currency.optional(), email: email.optional() });

export const OPTIONS = preflight;
export const POST = route(async (req) => {
	await rateLimit(req, "cart-create");
	const input = await body(req, schema);
	const customer = await optionalCustomer(req);
	const cart = await createCart({ ...input, email: input.email ?? customer?.email, customerId: customer?.id });
	return json(req, { cart: serializeCart(await retrieveCart(cart.id)) }, { status: 201 });
});
