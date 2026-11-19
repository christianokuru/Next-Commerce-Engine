import "server-only";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getCustomerForUser } from "@/modules/customer/service";
import { getSettings } from "@/modules/store/service";
import { currency } from "@/lib/validators";
import type { CartWithTotals } from "@/workflows/cart";
import { CommerceError } from "@/lib/errors";

/** Resolve the customer from a session cookie, if present (same-site or credentialed CORS). */
export async function optionalCustomer(req: Request) {
	const s = await auth().api.getSession({ headers: req.headers }).catch(() => null);
	if (!s) return null;
	return getCustomerForUser(s.user);
}

/** Signed-in customer (session cookie or `Authorization: Bearer <token>`), or 401. */
export async function requireStoreCustomer(req: Request) {
	const c = await optionalCustomer(req);
	if (!c) throw new CommerceError("unauthorized", "Sign in with a verified email to access your account");
	return c;
}

export async function resolveCurrency(req: Request) {
	const settings = await getSettings();
	const q = new URL(req.url).searchParams.get("currency");
	const c = q ? currency.parse(q) : settings.defaultCurrency;
	if (!settings.currencies.includes(c)) throw new z.ZodError([{ code: "custom", path: ["currency"], message: "Unsupported currency", input: c }]);
	return c;
}

/** Public cart shape (no internal ids beyond what a storefront needs). */
export function serializeCart(c: CartWithTotals) {
	return {
		id: c.id,
		email: c.email,
		currencyCode: c.currencyCode,
		shippingAddress: c.shippingAddress,
		billingAddress: c.billingAddress,
		completedAt: c.completedAt,
		items: c.items,
		shippingOption: c.shippingOption,
		promotion: c.promotion ? { code: c.promotion.code, type: c.promotion.type, value: c.promotion.value } : null,
		totals: c.totals,
	};
}
