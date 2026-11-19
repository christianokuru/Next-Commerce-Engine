import { z } from "zod";
import { route, preflight, body } from "@/lib/http";
import { id } from "@/lib/validators";
import { removeLineItem, updateLineItem } from "@/modules/cart/service";
import { serializeCart } from "@/server/store-api";

type P = { id: string; itemId: string };
const schema = z.object({ quantity: z.number().int().min(0).max(100) });

export const OPTIONS = preflight;
export const PATCH = route<P>(async (req, p) => {
	const { quantity } = await body(req, schema);
	return { cart: serializeCart(await updateLineItem(id("cart").parse(p.id), id("item").parse(p.itemId), quantity)) };
});
export const DELETE = route<P>(async (_req, p) => ({ cart: serializeCart(await removeLineItem(id("cart").parse(p.id), id("item").parse(p.itemId))) }));
