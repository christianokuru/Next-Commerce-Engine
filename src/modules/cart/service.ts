/**
 * Cart module — cart and line-item persistence only. Pricing, stock and shipping rules are
 * composed in src/workflows/cart.ts.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { carts, cartLineItems } from "./schema";
import type { Address } from "@/lib/address";
import { newId } from "@/lib/id";
import { notAllowed, notFound } from "@/lib/errors";

export type Cart = typeof carts.$inferSelect;
export type CartLineRow = typeof cartLineItems.$inferSelect;
export const MAX_LINE_QUANTITY = 100;
export const MAX_LINES = 50;

export async function createCart(input: { currencyCode: string; email?: string | null; customerId?: string | null }) {
	const [cart] = await db()
		.insert(carts)
		.values({ id: newId("cart"), currencyCode: input.currencyCode.toUpperCase(), email: input.email?.trim().toLowerCase() || null, customerId: input.customerId ?? null })
		.returning();
	return cart;
}

export async function getCart(id: string, d: Db = db()) {
	const [cart] = await d.select().from(carts).where(eq(carts.id, id));
	if (!cart) throw notFound("Cart");
	return cart;
}

export async function getOpenCart(id: string, d: Db = db()) {
	const cart = await getCart(id, d);
	if (cart.completedAt) throw notAllowed("Cart is already completed");
	return cart;
}

/** Row lock for checkout completion. */
export async function lockCart(tx: Db, id: string) {
	await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, id)).for("update");
}

export async function getLines(cartId: string, d: Db = db()) {
	return d.select().from(cartLineItems).where(eq(cartLineItems.cartId, cartId)).orderBy(cartLineItems.createdAt);
}

export async function getLine(cartId: string, itemId: string) {
	const [line] = await db().select().from(cartLineItems).where(and(eq(cartLineItems.id, itemId), eq(cartLineItems.cartId, cartId)));
	if (!line) throw notFound("Line item");
	return line;
}

export async function findLineByVariant(cartId: string, variantId: string) {
	const [line] = await db().select().from(cartLineItems).where(and(eq(cartLineItems.cartId, cartId), eq(cartLineItems.variantId, variantId)));
	return line ?? null;
}

export async function countLines(cartId: string) {
	const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(cartLineItems).where(eq(cartLineItems.cartId, cartId));
	return n;
}

export async function addQuantity(cartId: string, variantId: string, quantity: number) {
	await db()
		.insert(cartLineItems)
		.values({ id: newId("item"), cartId, variantId, quantity })
		.onConflictDoUpdate({ target: [cartLineItems.cartId, cartLineItems.variantId], set: { quantity: sql`${cartLineItems.quantity} + ${quantity}` } });
	await touch(cartId);
}

export async function setQuantity(cartId: string, itemId: string, quantity: number) {
	await db().update(cartLineItems).set({ quantity }).where(and(eq(cartLineItems.id, itemId), eq(cartLineItems.cartId, cartId)));
	await touch(cartId);
}

export async function removeLine(cartId: string, itemId: string) {
	await db().delete(cartLineItems).where(and(eq(cartLineItems.id, itemId), eq(cartLineItems.cartId, cartId)));
	await touch(cartId);
}

export type CartPatch = Partial<Pick<Cart, "email" | "shippingAddress" | "billingAddress" | "customerId" | "shippingOptionId" | "promotionId">>;

export async function updateCart(cartId: string, patch: CartPatch) {
	if (patch.email) patch.email = patch.email.trim().toLowerCase();
	if (patch.shippingAddress) patch.shippingAddress = { ...patch.shippingAddress, countryCode: patch.shippingAddress.countryCode.toUpperCase() } as Address;
	await db().update(carts).set({ ...patch, updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export async function markCompleted(tx: Db, cartId: string) {
	await tx.update(carts).set({ completedAt: new Date() }).where(eq(carts.id, cartId));
}

const touch = (id: string) => db().update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, id));

/** Abandoned carts older than N days with no payment attempts (payment ids passed in by the caller). */
export async function deleteStaleCarts(olderThanDays: number, keepCartIds: string[]) {
	const where = sql`${carts.completedAt} is null and ${carts.updatedAt} < now() - make_interval(days => ${olderThanDays})`;
	const ids = (await db().select({ id: carts.id }).from(carts).where(where).limit(500)).map((r) => r.id).filter((id) => !keepCartIds.includes(id));
	if (ids.length) await db().delete(carts).where(inArray(carts.id, ids));
	return ids.length;
}
