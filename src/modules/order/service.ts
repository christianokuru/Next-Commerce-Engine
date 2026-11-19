import { and, count, desc, eq, gte, ilike, inArray, or, sql, sum } from "drizzle-orm";
import { db, transaction, type Db } from "@/db";
import { orders, orderLineItems, orderEvents, FULFILLMENT_STATUS } from "./schema";
import { carts } from "../cart/schema";
import { customers } from "../customer/schema";
import { productVariants } from "../product/schema";
import { retrieveCart, type CartWithTotals } from "../cart/service";
import { decrementForOrder, restockForOrder } from "../inventory/service";
import { recordUsage } from "../promotion/service";
import { getOrCreateByEmail } from "../customer/service";
import { getSettings } from "../store/service";
import { newId } from "@/lib/id";
import { notAllowed, notFound } from "@/lib/errors";

export type Order = typeof orders.$inferSelect;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUS)[number];

export async function addOrderEvent(d: Db, orderId: string, type: string, data?: Record<string, unknown>, actorId?: string) {
	await d.insert(orderEvents).values({ id: newId("oevt"), orderId, type, data, actorId });
}

/**
 * Create an order from a cart inside the caller's transaction.
 * Caller must hold a row lock on the cart (SELECT ... FOR UPDATE).
 */
export async function createOrderFromCart(tx: Db, cart: CartWithTotals, opts: { paymentId: string }) {
	const settings = await getSettings();
	const customer = cart.customerId
		? (await tx.select().from(customers).where(eq(customers.id, cart.customerId)))[0]
		: await getOrCreateByEmail(cart.email!, tx, {
				firstName: cart.shippingAddress?.firstName, lastName: cart.shippingAddress?.lastName, phone: cart.shippingAddress?.phone,
			});

	const orderId = newId("order");
	const [order] = await tx
		.insert(orders)
		.values({
			id: orderId,
			cartId: cart.id,
			customerId: customer?.id ?? null,
			email: cart.email!,
			currencyCode: cart.currencyCode,
			status: "pending",
			paymentStatus: "captured",
			subtotal: cart.totals.subtotal,
			discountTotal: cart.totals.discountTotal,
			shippingTotal: cart.totals.shippingTotal,
			taxTotal: cart.totals.taxTotal,
			total: cart.totals.total,
			taxInclusive: settings.taxInclusive,
			shippingAddress: cart.shippingAddress,
			billingAddress: cart.billingAddress ?? cart.shippingAddress,
			shippingMethod: cart.shippingOption
				? { optionId: cart.shippingOption.id, name: cart.shippingOption.name, amount: cart.totals.shippingTotal }
				: null,
			promotion: cart.promotion && !cart.totals.promotionError ? cart.promotion : null,
		})
		.returning();

	const lines = cart.items.filter((i) => i.purchasable);
	await tx.insert(orderLineItems).values(
		lines.map((i) => ({
			id: newId("oli"), orderId, productId: i.productId, variantId: i.variantId, title: i.title,
			variantTitle: i.variantTitle, sku: i.sku, thumbnail: i.thumbnail, unitPrice: i.unitPrice!, quantity: i.quantity, total: i.total,
		})),
	);

	const failed = await decrementForOrder(tx, lines.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), orderId);
	if (cart.promotion && !cart.totals.promotionError) await recordUsage(tx, cart.promotion.id);
	await tx.update(carts).set({ completedAt: new Date() }).where(eq(carts.id, cart.id));
	await addOrderEvent(tx, orderId, "order.placed", { paymentId: opts.paymentId, total: order.total });

	if (failed.length) {
		// Payment was already captured: keep the order but flag it so staff can resolve (restock or refund).
		await tx.update(orders).set({ status: "requires_action" }).where(eq(orders.id, orderId));
		await addOrderEvent(tx, orderId, "inventory.insufficient", { variantIds: failed });
		order.status = "requires_action";
	}
	return order;
}

export async function getOrder(id: string) {
	const o = await db().query.orders.findFirst({
		where: eq(orders.id, id),
		with: { items: true, events: { orderBy: desc(orderEvents.createdAt) }, payments: { with: { refunds: true } }, customer: true },
	});
	return o ?? null;
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** Customer-scoped fetch (prevents IDOR). */
export async function getCustomerOrder(customerId: string, orderId: string) {
	const o = await db().query.orders.findFirst({
		where: and(eq(orders.id, orderId), eq(orders.customerId, customerId)),
		with: { items: true },
	});
	return o ?? null;
}

export async function listOrders(opts: { q?: string; status?: Order["status"]; customerId?: string; limit?: number; offset?: number } = {}) {
	const conds = [];
	if (opts.status) conds.push(eq(orders.status, opts.status));
	if (opts.customerId) conds.push(eq(orders.customerId, opts.customerId));
	if (opts.q) {
		const n = Number(opts.q.replace(/^#/, ""));
		conds.push(Number.isInteger(n) && n > 0 ? or(eq(orders.displayId, n), ilike(orders.email, `%${opts.q}%`)) : ilike(orders.email, `%${opts.q}%`));
	}
	const where = conds.length ? and(...conds) : undefined;
	const [rows, [{ total }]] = await Promise.all([
		db().select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(Math.min(opts.limit ?? 25, 100)).offset(opts.offset ?? 0),
		db().select({ total: count() }).from(orders).where(where),
	]);
	return { orders: rows, count: total };
}

export async function updateFulfillment(
	orderId: string,
	input: { status: FulfillmentStatus; trackingNumber?: string | null; carrier?: string | null },
	actorId?: string,
) {
	return transaction(async (tx) => {
		const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
		if (!o) throw notFound("Order");
		if (o.status === "canceled") throw notAllowed("Order is canceled");
		const patch: Partial<Order> = { fulfillmentStatus: input.status };
		if (input.trackingNumber !== undefined) patch.trackingNumber = input.trackingNumber;
		if (input.carrier !== undefined) patch.carrier = input.carrier;
		if (input.status === "delivered") patch.status = "completed";
		await tx.update(orders).set(patch).where(eq(orders.id, orderId));
		await addOrderEvent(tx, orderId, `fulfillment.${input.status}`, { trackingNumber: input.trackingNumber, carrier: input.carrier }, actorId);
		return { ...o, ...patch };
	});
}

export async function cancelOrder(orderId: string, actorId?: string, opts: { restock?: boolean } = {}) {
	return transaction(async (tx) => {
		const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
		if (!o) throw notFound("Order");
		if (o.status === "canceled") return o;
		if (["shipped", "delivered"].includes(o.fulfillmentStatus)) throw notAllowed("Shipped orders cannot be canceled");
		const items = await tx.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId));
		if (opts.restock !== false) {
			const lines = items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));
			// Only restock variants that still exist.
			const existing = lines.length
				? await tx.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.id, lines.map((l) => l.variantId)))
				: [];
			const ids = new Set(existing.map((e) => e.id));
			await restockForOrder(tx, lines.filter((l) => ids.has(l.variantId)), orderId);
		}
		const [updated] = await tx
			.update(orders)
			.set({ status: "canceled", fulfillmentStatus: "canceled", canceledAt: new Date() })
			.where(eq(orders.id, orderId))
			.returning();
		await addOrderEvent(tx, orderId, "order.canceled", { restocked: opts.restock !== false }, actorId);
		return updated;
	});
}

export async function addOrderNote(orderId: string, note: string, actorId: string) {
	await addOrderEvent(db(), orderId, "note", { note: note.slice(0, 2000) }, actorId);
}

export async function dashboardStats(days = 30) {
	const since = new Date(Date.now() - days * 86400_000);
	const notCanceled = sql`${orders.status} <> 'canceled'`;
	const [[rev], [ordCount], [cusCount], recent, byDay] = await Promise.all([
		db()
			.select({ currency: orders.currencyCode, revenue: sum(sql`${orders.total} - ${orders.refundedTotal}`).mapWith(Number) })
			.from(orders)
			.where(and(gte(orders.createdAt, since), notCanceled))
			.groupBy(orders.currencyCode)
			.orderBy(desc(sum(orders.total)))
			.limit(1),
		db().select({ n: count() }).from(orders).where(gte(orders.createdAt, since)),
		db().select({ n: count() }).from(customers),
		db().select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
		db()
			.select({
				day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`,
				total: sum(orders.total).mapWith(Number),
				n: count(),
			})
			.from(orders)
			.where(and(gte(orders.createdAt, since), notCanceled))
			.groupBy(sql`1`)
			.orderBy(sql`1`),
	]);
	const pending = await db().select({ n: count() }).from(orders).where(and(eq(orders.fulfillmentStatus, "not_fulfilled"), notCanceled));
	return {
		revenue: rev?.revenue ?? 0,
		revenueCurrency: rev?.currency ?? null,
		orders: ordCount?.n ?? 0,
		customers: cusCount?.n ?? 0,
		toFulfill: pending[0]?.n ?? 0,
		recent,
		byDay,
	};
}

export { retrieveCart };
