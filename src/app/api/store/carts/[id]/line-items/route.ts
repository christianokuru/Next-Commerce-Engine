import { z } from "zod";
import { route, preflight, body } from "@/lib/http";
import { id } from "@/lib/validators";
import { addLineItem } from "@/modules/cart/service";
import { serializeCart } from "@/server/store-api";

const schema = z.object({ variantId: id("variant"), quantity: z.number().int().min(1).max(100) });

export const OPTIONS = preflight;
export const POST = route<{ id: string }>(async (req, p) => {
	const { variantId, quantity } = await body(req, schema);
	return { cart: serializeCart(await addLineItem(id("cart").parse(p.id), variantId, quantity)) };
});
