import { z } from "zod";
import { route, preflight, body, rateLimit } from "@/lib/http";
import { id } from "@/lib/validators";
import { applyPromotion, removePromotion } from "@/workflows/cart";
import { serializeCart } from "@/server/store-api";

export const OPTIONS = preflight;
export const POST = route<{ id: string }>(async (req, p) => {
	await rateLimit(req, "promo"); // slows down code enumeration
	const { code } = await body(req, z.object({ code: z.string().trim().min(1).max(32) }));
	return { cart: serializeCart(await applyPromotion(id("cart").parse(p.id), code)) };
});
export const DELETE = route<{ id: string }>(async (_req, p) => ({ cart: serializeCart(await removePromotion(id("cart").parse(p.id))) }));
