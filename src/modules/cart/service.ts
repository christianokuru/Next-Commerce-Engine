import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { carts, cartLineItems } from "./schema";
import { productVariants, productVariantPrices, products } from "../product/schema";
import { shippingOptions } from "../shipping/schema";
import { promotions } from "../promotion/schema";
import type { Address } from "../customer/schema";
import { getSettings } from "../store/service";
import { findByCode } from "../promotion/service";
import { optionsFor } from "../shipping/service";
import { findUnavailable } from "../inventory/service";
import { calculateTotals, promotionError, type Totals } from "../pricing/totals";
import { newId } from "@/lib/id";
import { invalid, notAllowed, notFound } from "@/lib/errors";

export const MAX_LINE_QUANTITY = 100;
export const MAX_LINES = 50;

export type Cart = typeof carts.$inferSelect;

export async function createCart(input: { currencyCode?: string; email?: string | null; customerId?: string | null }) {
	const settings = await getSettings();
	const currency = (input.currencyCode ?? settings.defaultCurrency).toUpperCase();
	if (!settings.currencies.includes(currency)) throw invalid(`Currency ${currency} is not supported by this store`);
	const id = newId("cart");
	const [cart] = await db()
		.insert(carts)
		.values({ id, currencyCode: currency, email: input.email?.trim().toLowerCase() || null, customerId: input.customerId ?? null })
		.returning();
	return cart;
}

async function getOpenCart(id: string, d: Db = db()) {
	const [cart] = await d.select().from(carts).where(eq(carts.id, id));
	if (!cart) throw notFound("Cart");
	if (cart.completedAt) throw notAllowed("Cart is already completed");
	return cart;
}

const touch = (id: string, d: Db = db()) => d.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, id));

export type CartLine = {
	id: string;
	variantId: string;
	productId: string;
	title: string;
	variantTitle: string;
	sku: string | null;
	thumbnail: string | null;
	quantity: number;
	unitPrice: number | null;
	total: number;
	purchasable: boolean;
};

export type CartWithTotals = Cart & {
	items: CartLine[];
	totals: Totals;
	shippingOption: { id: string; name: string; amount: number; freeOverAmount: number | null } | null;
	promotion: { id: string; code: string; type: string; value: number } | null;
};

/** Load cart with live prices and computed totals. Single source of truth for amounts. */
export async function retrieveCart(id: string, d: Db = db()): Promise<CartWithTotals> {
	const [cart] = await d.select().from(carts).where(eq(carts.id, id));
	if (!cart) throw notFound("Cart");
	const settings = await getSettings();

	const rows = await d
		.select({
			id: cartLineItems.id,
			variantId: cartLineItems.variantId,
			quantity: cartLineItems.quantity,
			productId: products.id,
			title: products.title,
			status: products.status,
			thumbnail: products.thumbnail,
			variantTitle: productVariants.title,
			sku: productVariants.sku,
			unitPrice: productVariantPrices.amount,
		})
		.from(cartLineItems)
		.innerJoin(productVariants, eq(productVariants.id, cartLineItems.variantId))
		.innerJoin(products, eq(products.id, productVariants.productId))
		.leftJoin(
			productVariantPrices,
			and(eq(productVariantPrices.variantId, productVariants.id), eq(productVariantPrices.currencyCode, cart.currencyCode)),
		)
		.where(eq(cartLineItems.cartId, id))
		.orderBy(cartLineItems.createdAt);

	const items: CartLine[] = rows.map((r) => {
		const purchasable = r.status === "published" && r.unitPrice !== null;
		return {
			id: r.id, variantId: r.variantId, productId: r.productId, title: r.title, variantTitle: r.variantTitle,
			sku: r.sku, thumbnail: r.thumbnail, quantity: r.quantity, unitPrice: r.unitPrice,
			total: (r.unitPrice ?? 0) * r.quantity, purchasable,
		};
	});

	const [so] = cart.shippingOptionId
		? await d.select().from(shippingOptions).where(eq(shippingOptions.id, cart.shippingOptionId))
		: [];
	const [promo] = cart.promotionId ? await d.select().from(promotions).where(eq(promotions.id, cart.promotionId)) : [];

	const totals = calculateTotals({
		currency: cart.currencyCode,
		items: items.filter((i) => i.purchasable).map((i) => ({ unitPrice: i.unitPrice!, quantity: i.quantity })),
		shipping: so ? { amount: so.amount, freeOverAmount: so.freeOverAmount } : null,
		promotion: promo ?? null,
		taxRateBps: settings.taxRateBps,
		taxInclusive: settings.taxInclusive,
	});

	return {
		...cart,
		items,
		totals,
		shippingOption: so ? { id: so.id, name: so.name, amount: so.amount, freeOverAmount: so.freeOverAmount } : null,
		promotion: promo ? { id: promo.id, code: promo.code, type: promo.type, value: promo.value } : null,
	};
}

export async function addLineItem(cartId: string, variantId: string, quantity: number) {
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) throw invalid("Invalid quantity");
	const cart = await getOpenCart(cartId);
	const [variant] = await db()
		.select({ id: productVariants.id, status: products.status, price: productVariantPrices.amount })
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.leftJoin(productVariantPrices, and(eq(productVariantPrices.variantId, productVariants.id), eq(productVariantPrices.currencyCode, cart.currencyCode)))
		.where(eq(productVariants.id, variantId));
	if (!variant || variant.status !== "published") throw notFound("Variant");
	if (variant.price === null) throw notAllowed(`Variant is not available in ${cart.currencyCode}`);

	const [existing] = await db().select().from(cartLineItems).where(and(eq(cartLineItems.cartId, cartId), eq(cartLineItems.variantId, variantId)));
	const newQty = (existing?.quantity ?? 0) + quantity;
	if (newQty > MAX_LINE_QUANTITY) throw invalid(`Maximum quantity per item is ${MAX_LINE_QUANTITY}`);
	if (!existing) {
		const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(cartLineItems).where(eq(cartLineItems.cartId, cartId));
		if (n >= MAX_LINES) throw notAllowed("Cart has too many items");
	}
	if ((await findUnavailable([{ variantId, quantity: newQty }])).length) throw notAllowed("Not enough stock for this item");

	await db()
		.insert(cartLineItems)
		.values({ id: newId("item"), cartId, variantId, quantity })
		.onConflictDoUpdate({
			target: [cartLineItems.cartId, cartLineItems.variantId],
			set: { quantity: sql`${cartLineItems.quantity} + ${quantity}` },
		});
	await touch(cartId);
	return retrieveCart(cartId);
}

export async function updateLineItem(cartId: string, itemId: string, quantity: number) {
	if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) throw invalid("Invalid quantity");
	await getOpenCart(cartId);
	if (quantity === 0) return removeLineItem(cartId, itemId);
	const [item] = await db().select().from(cartLineItems).where(and(eq(cartLineItems.id, itemId), eq(cartLineItems.cartId, cartId)));
	if (!item) throw notFound("Line item");
	if ((await findUnavailable([{ variantId: item.variantId, quantity }])).length) throw notAllowed("Not enough stock for this item");
	await db().update(cartLineItems).set({ quantity }).where(eq(cartLineItems.id, itemId));
	await touch(cartId);
	return retrieveCart(cartId);
}

export async function removeLineItem(cartId: string, itemId: string) {
	await getOpenCart(cartId);
	await db().delete(cartLineItems).where(and(eq(cartLineItems.id, itemId), eq(cartLineItems.cartId, cartId)));
	await touch(cartId);
	return retrieveCart(cartId);
}

export async function updateCart(
	cartId: string,
	input: { email?: string; shippingAddress?: Address; billingAddress?: Address | null; customerId?: string | null },
) {
	const cart = await getOpenCart(cartId);
	const patch: Partial<typeof carts.$inferInsert> = { updatedAt: new Date() };
	if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
	if (input.billingAddress !== undefined) patch.billingAddress = input.billingAddress;
	if (input.customerId !== undefined) patch.customerId = input.customerId;
	if (input.shippingAddress !== undefined) {
		patch.shippingAddress = { ...input.shippingAddress, countryCode: input.shippingAddress.countryCode.toUpperCase() };
		// Drop a shipping method that no longer serves the new destination.
		if (cart.shippingOptionId) {
			const opts = await optionsFor(patch.shippingAddress.countryCode, cart.currencyCode);
			if (!opts.some((o) => o.id === cart.shippingOptionId)) patch.shippingOptionId = null;
		}
	}
	await db().update(carts).set(patch).where(eq(carts.id, cartId));
	return retrieveCart(cartId);
}

export async function listShippingOptionsForCart(cartId: string) {
	const cart = await retrieveCart(cartId);
	if (!cart.shippingAddress) return [];
	const opts = await optionsFor(cart.shippingAddress.countryCode, cart.currencyCode);
	return opts.map((o) => ({
		...o,
		effectiveAmount: o.freeOverAmount !== null && cart.totals.subtotal >= o.freeOverAmount ? 0 : o.amount,
	}));
}

export async function setShippingOption(cartId: string, optionId: string) {
	const cart = await getOpenCart(cartId);
	if (!cart.shippingAddress) throw notAllowed("Add a shipping address first");
	const opts = await optionsFor(cart.shippingAddress.countryCode, cart.currencyCode);
	if (!opts.some((o) => o.id === optionId)) throw notAllowed("Shipping option is not available for this cart");
	await db().update(carts).set({ shippingOptionId: optionId, updatedAt: new Date() }).where(eq(carts.id, cartId));
	return retrieveCart(cartId);
}

export async function applyPromotion(cartId: string, code: string) {
	await getOpenCart(cartId);
	const promo = await findByCode(code);
	if (!promo) throw notAllowed("Invalid promotion code");
	const current = await retrieveCart(cartId);
	const err = promotionError(promo, { subtotal: current.totals.subtotal, currency: current.currencyCode });
	if (err) throw notAllowed(err);
	await db().update(carts).set({ promotionId: promo.id, updatedAt: new Date() }).where(eq(carts.id, cartId));
	return retrieveCart(cartId);
}

export async function removePromotion(cartId: string) {
	await getOpenCart(cartId);
	await db().update(carts).set({ promotionId: null, updatedAt: new Date() }).where(eq(carts.id, cartId));
	return retrieveCart(cartId);
}

/** Validate a cart is ready for payment. Throws a descriptive error otherwise. */
export async function assertCheckoutReady(cart: CartWithTotals, d: Db = db()) {
	if (cart.completedAt) throw notAllowed("Cart is already completed");
	if (!cart.items.length) throw notAllowed("Cart is empty");
	if (cart.items.some((i) => !i.purchasable)) throw notAllowed("Some items are no longer available; remove them to continue");
	if (!cart.email) throw notAllowed("Email is required");
	if (!cart.shippingAddress) throw notAllowed("Shipping address is required");
	if (!cart.shippingOption) {
		const opts = await optionsFor(cart.shippingAddress.countryCode, cart.currencyCode, d);
		if (opts.length) throw notAllowed("Select a shipping method");
	}
	if (cart.promotion && cart.totals.promotionError) throw notAllowed(cart.totals.promotionError);
	const unavailable = await findUnavailable(cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), d);
	if (unavailable.length) throw notAllowed("Some items are out of stock");
	if (cart.totals.total <= 0) throw notAllowed("Order total must be greater than zero");
}

export async function deleteStaleCarts(olderThanDays = 30) {
	const ids = db()
		.select({ id: carts.id })
		.from(carts)
		.where(sql`${carts.completedAt} is null and ${carts.updatedAt} < now() - make_interval(days => ${olderThanDays}) and not exists (select 1 from payments p where p.cart_id = ${carts.id})`);
	await db().delete(carts).where(inArray(carts.id, ids));
}
