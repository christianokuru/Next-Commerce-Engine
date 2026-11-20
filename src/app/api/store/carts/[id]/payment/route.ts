import { z } from "zod";
import { route, preflight, body, rateLimit } from "@/lib/http";
import { id } from "@/lib/validators";
import { PAYMENT_PROVIDERS } from "@/modules/payment/schema";
import { availableProviders, initiatePayment } from "@/workflows/checkout";
import { retrieveCart } from "@/workflows/cart";
import { isAllowedRedirect } from "@/lib/origins";
import { invalid } from "@/lib/errors";

const schema = z.object({ provider: z.enum(PAYMENT_PROVIDERS), cancelUrl: z.url().max(500).optional(), returnUrl: z.url().max(500).optional() });

export const OPTIONS = preflight;

/** List payment providers usable for this cart. */
export const GET = route<{ id: string }>(async (_req, p) => {
	const cart = await retrieveCart(id("cart").parse(p.id));
	return { providers: await availableProviders(cart.currencyCode) };
});

/** Start a hosted payment; the client redirects the shopper to `redirectUrl`. */
export const POST = route<{ id: string }>(async (req, p) => {
	await rateLimit(req, "payment");
	const { provider, cancelUrl, returnUrl } = await body(req, schema);
	// Only send shoppers back to our own storefronts (no open redirects via the payment page).
	for (const [name, url] of [["cancelUrl", cancelUrl], ["returnUrl", returnUrl]] as const)
		if (url && !(await isAllowedRedirect(url))) throw invalid(`${name} must be on an allowed storefront origin (STORE_CORS or Settings → Storefront URL)`);
	return initiatePayment(id("cart").parse(p.id), provider, { cancelUrl, returnUrl });
});
