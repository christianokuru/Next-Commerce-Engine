/**
 * Cart workflows: compose cart + product + inventory + shipping + promotion + store modules.
 * `retrieveCart` is the single source of truth for cart amounts.
 */
import type { Db } from "@/db";
import * as cartModule from "@/modules/cart/service";
import * as product from "@/modules/product/service";
import * as inventory from "@/modules/inventory/service";
import * as shipping from "@/modules/shipping/service";
import * as promotion from "@/modules/promotion/service";
import { getSettings } from "@/modules/store/service";
import { calculateTotals, promotionError, type Totals } from "@/modules/pricing/totals";
import type { Address } from "@/lib/address";
import { invalid, notAllowed, notFound } from "@/lib/errors";
import { hasFeature, requireFeature } from "@/lib/plan";

const { MAX_LINE_QUANTITY, MAX_LINES } = cartModule;
export type Cart = cartModule.Cart;

export type CartLine = {
	id: string; variantId: string; productId: string | null; title: string; variantTitle: string; sku: string | null;
	thumbnail: string | null; quantity: number; unitPrice: number | null; total: number; purchasable: boolean;
};
export type CartWithTotals = Cart & {
	items: CartLine[];
	totals: Totals;
	shippingOption: { id: string; name: string; amount: number; freeOverAmount: number | null } | null;
	promotion: { id: string; code: string; type: string; value: number } | null;
};

export async function createCart(input: { currencyCode?: string; email?: string | null; customerId?: string | null }) {
	const settings = await getSettings();
	const currency = (input.currencyCode ?? settings.defaultCurrency).toUpperCase();
	if (!settings.currencies.includes(currency)) throw invalid(`Currency ${currency} is not supported by this store`);
	return cartModule.createCart({ ...input, currencyCode: currency });
}

export async function retrieveCart(id: string, d?: Db): Promise<CartWithTotals> {
	const cart = await cartModule.getCart(id, d);
	const [settings, lines] = await Promise.all([getSettings(), cartModule.getLines(id, d)]);
	const variants = new Map((await product.getVariantsForCart(lines.map((l) => l.variantId), cart.currencyCode, d)).map((v) => [v.variantId, v]));

	const items: CartLine[] = lines.map((l) => {
		const v = variants.get(l.variantId);
		const unitPrice = v?.unitPrice ?? null;
		return {
			id: l.id, variantId: l.variantId, productId: v?.productId ?? null, title: v?.title ?? "Unavailable item", variantTitle: v?.variantTitle ?? "",
			sku: v?.sku ?? null, thumbnail: v?.thumbnail ?? null, quantity: l.quantity, unitPrice,
			total: (unitPrice ?? 0) * l.quantity, purchasable: Boolean(v && v.status === "published" && unitPrice !== null),
		};
	});

	const [so, promo] = await Promise.all([
		cart.shippingOptionId ? shipping.getOption(cart.shippingOptionId, d) : null,
		cart.promotionId && hasFeature("discounts") ? promotion.getPromotion(cart.promotionId, d) : null,
	]);
	const totals = calculateTotals({
		currency: cart.currencyCode,
		items: items.filter((i) => i.purchasable).map((i) => ({ unitPrice: i.unitPrice!, quantity: i.quantity })),
		shipping: so ? { amount: so.amount, freeOverAmount: so.freeOverAmount } : null,
		promotion: promo,
		taxRateBps: settings.taxRateBps,
		taxInclusive: settings.taxInclusive,
	});
	return {
		...cart, items, totals,
		shippingOption: so ? { id: so.id, name: so.name, amount: so.amount, freeOverAmount: so.freeOverAmount } : null,
		promotion: promo ? { id: promo.id, code: promo.code, type: promo.type, value: promo.value } : null,
	};
}

async function assertStock(variantId: string, quantity: number) {
	if (!hasFeature("inventoryTracking")) return; // Starter: no stock tracking, items are always available
	if ((await inventory.findUnavailable([{ variantId, quantity }])).length) throw notAllowed("Not enough stock for this item");
}

export async function addLineItem(cartId: string, variantId: string, quantity: number) {
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) throw invalid("Invalid quantity");
	const cart = await cartModule.getOpenCart(cartId);
	const [v] = await product.getVariantsForCart([variantId], cart.currencyCode);
	if (!v || v.status !== "published") throw notFound("Variant");
	if (v.unitPrice === null) throw notAllowed(`Variant is not available in ${cart.currencyCode}`);
	const existing = await cartModule.findLineByVariant(cartId, variantId);
	const newQty = (existing?.quantity ?? 0) + quantity;
	if (newQty > MAX_LINE_QUANTITY) throw invalid(`Maximum quantity per item is ${MAX_LINE_QUANTITY}`);
	if (!existing && (await cartModule.countLines(cartId)) >= MAX_LINES) throw notAllowed("Cart has too many items");
	await assertStock(variantId, newQty);
	await cartModule.addQuantity(cartId, variantId, quantity);
	return retrieveCart(cartId);
}

export async function updateLineItem(cartId: string, itemId: string, quantity: number) {
	if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) throw invalid("Invalid quantity");
	await cartModule.getOpenCart(cartId);
	if (quantity === 0) return removeLineItem(cartId, itemId);
	const line = await cartModule.getLine(cartId, itemId);
	await assertStock(line.variantId, quantity);
	await cartModule.setQuantity(cartId, itemId, quantity);
	return retrieveCart(cartId);
}

export async function removeLineItem(cartId: string, itemId: string) {
	await cartModule.getOpenCart(cartId);
	await cartModule.removeLine(cartId, itemId);
	return retrieveCart(cartId);
}

export async function updateCart(cartId: string, input: { email?: string; shippingAddress?: Address; billingAddress?: Address | null; customerId?: string | null }) {
	const cart = await cartModule.getOpenCart(cartId);
	const patch: cartModule.CartPatch = { ...input };
	if (input.shippingAddress && cart.shippingOptionId) {
		// Drop a shipping method that no longer serves the new destination.
		const opts = await shipping.optionsFor(input.shippingAddress.countryCode, cart.currencyCode);
		if (!opts.some((o) => o.id === cart.shippingOptionId)) patch.shippingOptionId = null;
	}
	await cartModule.updateCart(cartId, patch);
	return retrieveCart(cartId);
}

export async function listShippingOptionsForCart(cartId: string) {
	const cart = await retrieveCart(cartId);
	if (!cart.shippingAddress) return [];
	const opts = await shipping.optionsFor(cart.shippingAddress.countryCode, cart.currencyCode);
	return opts.map((o) => ({ ...o, effectiveAmount: o.freeOverAmount !== null && cart.totals.subtotal >= o.freeOverAmount ? 0 : o.amount }));
}

export async function setShippingOption(cartId: string, optionId: string) {
	const cart = await cartModule.getOpenCart(cartId);
	if (!cart.shippingAddress) throw notAllowed("Add a shipping address first");
	const opts = await shipping.optionsFor(cart.shippingAddress.countryCode, cart.currencyCode);
	if (!opts.some((o) => o.id === optionId)) throw notAllowed("Shipping option is not available for this cart");
	await cartModule.updateCart(cartId, { shippingOptionId: optionId });
	return retrieveCart(cartId);
}

export async function applyPromotion(cartId: string, code: string) {
	requireFeature("discounts");
	await cartModule.getOpenCart(cartId);
	const promo = await promotion.findByCode(code);
	if (!promo) throw notAllowed("Invalid promotion code");
	const current = await retrieveCart(cartId);
	const err = promotionError(promo, { subtotal: current.totals.subtotal, currency: current.currencyCode });
	if (err) throw notAllowed(err);
	await cartModule.updateCart(cartId, { promotionId: promo.id });
	return retrieveCart(cartId);
}

export async function removePromotion(cartId: string) {
	await cartModule.getOpenCart(cartId);
	await cartModule.updateCart(cartId, { promotionId: null });
	return retrieveCart(cartId);
}

/** Validate a cart is ready for payment. */
export async function assertCheckoutReady(cart: CartWithTotals, d?: Db) {
	if (cart.completedAt) throw notAllowed("Cart is already completed");
	if (!cart.items.length) throw notAllowed("Cart is empty");
	if (cart.items.some((i) => !i.purchasable)) throw notAllowed("Some items are no longer available; remove them to continue");
	if (!cart.email) throw notAllowed("Email is required");
	if (!cart.shippingAddress) throw notAllowed("Shipping address is required");
	if (!cart.shippingOption && (await shipping.optionsFor(cart.shippingAddress.countryCode, cart.currencyCode, d)).length)
		throw notAllowed("Select a shipping method");
	if (cart.promotion && cart.totals.promotionError) throw notAllowed(cart.totals.promotionError);
	if (hasFeature("inventoryTracking") && (await inventory.findUnavailable(cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), d)).length)
		throw notAllowed("Some items are out of stock");
	if (cart.totals.total <= 0) throw notAllowed("Order total must be greater than zero");
}
