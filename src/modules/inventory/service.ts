import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, transaction, type Db } from "@/db";
import { inventoryLevels, inventoryMovements } from "./schema";
import { productVariants, products } from "../product/schema";
import { newId } from "@/lib/id";
import { invalid, notFound } from "@/lib/errors";

type Reason = (typeof inventoryMovements.$inferInsert)["reason"];

export async function adjustStock(
	variantId: string,
	delta: number,
	opts: { reason?: Reason; note?: string; actorId?: string; reference?: string } = {},
	tx?: Db,
) {
	if (!Number.isInteger(delta) || delta === 0) throw invalid("Adjustment must be a non-zero integer");
	const run = async (t: Db) => {
		const [v] = await t.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.id, variantId));
		if (!v) throw notFound("Variant");
		const [level] = await t
			.insert(inventoryLevels)
			.values({ variantId, stockedQuantity: delta })
			.onConflictDoUpdate({
				target: inventoryLevels.variantId,
				set: { stockedQuantity: sql`${inventoryLevels.stockedQuantity} + ${delta}`, updatedAt: new Date() },
			})
			.returning();
		await t.insert(inventoryMovements).values({
			id: newId("imov"), variantId, delta, reason: opts.reason ?? "adjustment",
			note: opts.note, actorId: opts.actorId, reference: opts.reference,
		});
		return level;
	};
	return tx ? run(tx) : transaction(run);
}

export async function setStock(variantId: string, quantity: number, actorId?: string) {
	if (!Number.isInteger(quantity) || quantity < 0) throw invalid("Quantity must be a non-negative integer");
	return transaction(async (tx) => {
		const [level] = await tx.select().from(inventoryLevels).where(eq(inventoryLevels.variantId, variantId)).for("update");
		const current = level?.stockedQuantity ?? 0;
		if (current === quantity) return level;
		return adjustStock(variantId, quantity - current, { reason: "adjustment", actorId, note: `Set to ${quantity}` }, tx);
	});
}

export type StockLine = { variantId: string; quantity: number };

/** Returns variant ids that cannot satisfy the requested quantity. */
export async function findUnavailable(lines: StockLine[], d: Db = db()) {
	if (!lines.length) return [];
	const rows = await d
		.select({
			id: productVariants.id,
			manage: productVariants.manageInventory,
			backorder: productVariants.allowBackorder,
			stock: inventoryLevels.stockedQuantity,
		})
		.from(productVariants)
		.leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
		.where(inArray(productVariants.id, lines.map((l) => l.variantId)));
	const byId = new Map(rows.map((r) => [r.id, r]));
	return lines
		.filter((l) => {
			const r = byId.get(l.variantId);
			if (!r) return true;
			if (!r.manage || r.backorder) return false;
			return (r.stock ?? 0) < l.quantity;
		})
		.map((l) => l.variantId);
}

/**
 * Atomically decrement stock for an order inside the caller's transaction.
 * Uses conditional UPDATEs so concurrent orders can never oversell.
 * Returns variant ids that could not be decremented.
 */
export async function decrementForOrder(tx: Db, lines: StockLine[], orderId: string) {
	const failed: string[] = [];
	for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
		const [v] = await tx
			.select({ manage: productVariants.manageInventory, backorder: productVariants.allowBackorder })
			.from(productVariants)
			.where(eq(productVariants.id, l.variantId));
		if (!v) { failed.push(l.variantId); continue; }
		if (!v.manage) continue;
		const updated = await tx
			.update(inventoryLevels)
			.set({ stockedQuantity: sql`${inventoryLevels.stockedQuantity} - ${l.quantity}`, updatedAt: new Date() })
			.where(
				v.backorder
					? eq(inventoryLevels.variantId, l.variantId)
					: and(eq(inventoryLevels.variantId, l.variantId), sql`${inventoryLevels.stockedQuantity} >= ${l.quantity}`),
			)
			.returning({ id: inventoryLevels.variantId });
		if (!updated.length) { failed.push(l.variantId); continue; }
		await tx.insert(inventoryMovements).values({ id: newId("imov"), variantId: l.variantId, delta: -l.quantity, reason: "order", reference: orderId });
	}
	return failed;
}

export async function restockForOrder(tx: Db, lines: StockLine[], orderId: string) {
	for (const l of lines) {
		const [v] = await tx.select({ manage: productVariants.manageInventory }).from(productVariants).where(eq(productVariants.id, l.variantId));
		if (!v?.manage) continue;
		await adjustStock(l.variantId, l.quantity, { reason: "cancel", reference: orderId }, tx);
	}
}

export async function listInventory(opts: { lowStockOnly?: boolean; limit?: number } = {}) {
	return db()
		.select({
			variantId: productVariants.id,
			variantTitle: productVariants.title,
			sku: productVariants.sku,
			productId: products.id,
			productTitle: products.title,
			manageInventory: productVariants.manageInventory,
			allowBackorder: productVariants.allowBackorder,
			stock: inventoryLevels.stockedQuantity,
			lowStockThreshold: inventoryLevels.lowStockThreshold,
		})
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
		.where(
			opts.lowStockOnly
				? and(eq(productVariants.manageInventory, true), lte(inventoryLevels.stockedQuantity, sql`coalesce(${inventoryLevels.lowStockThreshold}, 5)`))
				: undefined,
		)
		.orderBy(asc(inventoryLevels.stockedQuantity), asc(products.title))
		.limit(Math.min(opts.limit ?? 200, 500));
}
