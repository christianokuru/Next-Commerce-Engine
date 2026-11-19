import { route, preflight } from "@/lib/http";
import { id } from "@/lib/validators";
import { listShippingOptionsForCart } from "@/modules/cart/service";

export const OPTIONS = preflight;
export const GET = route<{ id: string }>(async (_req, p) => ({ shippingOptions: await listShippingOptionsForCart(id("cart").parse(p.id)) }));
