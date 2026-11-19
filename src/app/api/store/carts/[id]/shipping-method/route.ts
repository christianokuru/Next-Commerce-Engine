import { z } from "zod";
import { route, preflight, body } from "@/lib/http";
import { id } from "@/lib/validators";
import { setShippingOption } from "@/modules/cart/service";
import { serializeCart } from "@/server/store-api";

export const OPTIONS = preflight;
export const POST = route<{ id: string }>(async (req, p) => {
	const { optionId } = await body(req, z.object({ optionId: id("so") }));
	return { cart: serializeCart(await setShippingOption(id("cart").parse(p.id), optionId)) };
});
