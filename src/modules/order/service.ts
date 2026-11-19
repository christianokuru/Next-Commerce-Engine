/**
 * Order module — orders, line-item snapshots and the event timeline.
 * Orders are created from a fully-priced snapshot handed over by the checkout workflow.
 */
import { and, count, desc, eq, gte, ilike, inArray, or, sql, sum } from "drizzle-orm";
import { db, inTx, type Db } from "@/db";
import { orders, orderLineItems, orderEvents, FULFILLMENT_STATUS, type ShippingMethodSnapshot, type PromotionSnapshot } from "./schema";
import type { Address } from "@/lib/address";
import { newId } from "@/lib/id";
import { notAllowed, notFound } from "@/lib/errors";

export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLineItems.$inferSelect;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUS)[number];

export type OrderSnapshot = {
	cartId: string; customerId: string | null; email: string; currencyCode: string; taxInclusive: boolean;
	totals: { subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; total: number };
	shippingAddress: Address | null; billingAddress: Address | null;
	shippingMethod: ShippingMethodSnapshot | null; promotion: PromotionSnapshot | null;
	items: { productId: string; variantId: string; title: string; variantTitle: string; sku: string | null; thumbnail: string | null; unitPrice: number; quantity: number }[];
};

export async function addOrderEvent(d: Db, orderId: string, type: string, data?: Record<string, unknown>, actorId?: string) {
	await d.insert(orderEvents).values({ id: newId("oevt"), orderId, type, data, actorId });
}

export async function createOrder(tx: Db, s: OrderSnapshot) {
	const id = newId("order");
	const [order] = await tx.insert(orders).values({
		id, cartId: s.cartId, customerId: s.customerId, email: s.email, currencyCode: s.currencyCode, status: "pending", paymentStatus: "captured",
		...s.totals, taxInclusive: s.taxInclusive, shippingAddress: s.shippingAddress, billingAddress: s.billingAddress ?? s.shippingAddress,
		shippingMethod: s.shippingMethod, promotion: s.promotion,
	}).returning();
	await tx.insert(orderLineItems).values(s.items.map((i) => ({ id: newId("oli"), orderId: id, ...i, total: i.unitPrice * i.quantity })));
	return order;
}

export async function flagRequiresAction(tx: Db, orderId: string, type: string, data: Record<string, unknown>) {
	await tx.update(orders).set({ status: "requires_action" }).where(eq(orders.id, orderId));
	await addOrderEvent(tx, orderId, type, data);
}

export async function getOrderRow(id: string, d: Db = db()) {
	const [o] = await d.select().from(orders).where(eq(orders.id, id));
	return o ?? null;
}

export async function getOrder(id: string) {
	const o = await db().query.orders.findFirst({ where: eq(orders.id, id), with: { items: true, events: { orderBy: desc(orderEvents.createdAt) } } });
	return o ?? null;
}
export type OrderWithItems = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** Customer-scoped fetch (prevents IDOR). */
export async function getCustomerOrder(customerId: string, orderId: string) {
	const o = await db().query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.customerId, customerId)), with: { items: true } });
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

export async function listByIds(ids: string[]) {
	if (!ids.length) return [];
	return db().select().from(orders).where(inArray(orders.id, ids));
}

export async function updateFulfillment(orderId: string, input: { status: FulfillmentStatus; trackingNumber?: string | null; carrier?: string | null }, actorId?: string) {
	return inTx(undefined, async (tx) => {
		const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
		if (!o) throw notFound("Order");
		if (o.status === "canceled") throw notAllowed("Order is canceled");
		const patch: Partial<Order> = { fulfillmentStatus: input.status };
		if (input.trackingNumber !== undefined) patch.trackingNumber = input.trackingNumber;
		if (input.carrier !== undefined) patch.carrier = input.carrier;
		if (input.status === "delivered") patch.status = "completed";
		await tx.update(orders).set(patch).where(eq(orders.id, orderId));
		await addOrderEvent(tx, orderId, `fulfillment.${input.status}`, { trackingNumber: input.trackingNumber, carrier: input.carrier }, actorId);
		return { before: o, after: { ...o, ...patch } };
	});
}

/** Marks the order canceled inside the caller's tx and returns its lines (for restocking). */
export async function cancel(tx: Db, orderId: string, actorId?: string, data: Record<string, unknown> = {}) {
	const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
	if (!o) throw notFound("Order");
	if (o.status === "canceled") return { order: o, items: [] as OrderLine[], alreadyCanceled: true };
	if (["shipped", "delivered"].includes(o.fulfillmentStatus)) throw notAllowed("Shipped orders cannot be canceled");
	const items = await tx.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId));
	const [order] = await tx.update(orders).set({ status: "canceled", fulfillmentStatus: "canceled", canceledAt: new Date() }).where(eq(orders.id, orderId)).returning();
	await addOrderEvent(tx, orderId, "order.canceled", data, actorId);
	return { order, items, alreadyCanceled: false };
}

export async function recordRefund(tx: Db, orderId: string, refundedTotal: number, full: boolean, event: Record<string, unknown>, actorId?: string) {
	await tx.update(orders).set({ refundedTotal, paymentStatus: full ? "refunded" : "partially_refunded" }).where(eq(orders.id, orderId));
	await addOrderEvent(tx, orderId, "payment.refunded", event, actorId);
}

export async function addOrderNote(orderId: string, note: string, actorId: string) {
	const o = await getOrderRow(orderId);
	if (!o) throw notFound("Order");
	await addOrderEvent(db(), orderId, "note", { note: note.slice(0, 2000) }, actorId);
}

export async function salesStats(days = 30) {
	const since = new Date(Date.now() - days * 86400_000);
	const live = sql`${orders.status} <> 'canceled'`;
	const [[rev], [ordCount], [toFulfill], recent, byDay] = await Promise.all([
		db().select({ currency: orders.currencyCode, revenue: sum(sql`${orders.total} - ${orders.refundedTotal}`).mapWith(Number) })
			.from(orders).where(and(gte(orders.createdAt, since), live)).groupBy(orders.currencyCode).orderBy(desc(sum(orders.total))).limit(1),
		db().select({ n: count() }).from(orders).where(gte(orders.createdAt, since)),
		db().select({ n: count() }).from(orders).where(and(eq(orders.fulfillmentStatus, "not_fulfilled"), live)),
		db().select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
		db().select({ day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`, total: sum(orders.total).mapWith(Number), n: count() })
			.from(orders).where(and(gte(orders.createdAt, since), live)).groupBy(sql`1`).orderBy(sql`1`),
	]);
	return { revenue: rev?.revenue ?? 0, revenueCurrency: rev?.currency ?? null, orders: ordCount?.n ?? 0, toFulfill: toFulfill?.n ?? 0, recent, byDay };
}
