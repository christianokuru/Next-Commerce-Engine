/**
 * Inventory module — stock per variant id. Knows nothing about products; callers pass variant ids.
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, inTx, type Db } from "@/db";
import { inventoryItems, inventoryMovements } from "./schema";
import { newId } from "@/lib/id";
import { invalid } from "@/lib/errors";

export type InventoryItem = typeof inventoryItems.$inferSelect;
type Reason = (typeof inventoryMovements.$inferInsert)["reason"];
export type StockLine = { variantId: string; quantity: number };
export type ItemSettings = { manageInventory?: boolean; allowBackorder?: boolean; lowStockThreshold?: number | null };

export async function createItems(items: ({ variantId: string; stock?: number } & ItemSettings)[], tx?: Db) {
	if (!items.length) return;
	await (tx ?? db()).insert(inventoryItems).values(
		items.map((i) => ({
			variantId: i.variantId, stockedQuantity: Math.max(0, Math.trunc(i.stock ?? 0)),
			manageInventory: i.manageInventory ?? true, allowBackorder: i.allowBackorder ?? false, lowStockThreshold: i.lowStockThreshold ?? null,
		})),
	).onConflictDoNothing();
}

export async function updateItemSettings(variantId: string, s: ItemSettings, tx?: Db) {
	await (tx ?? db()).insert(inventoryItems).values({ variantId, ...s }).onConflictDoUpdate({ target: inventoryItems.variantId, set: { ...s, updatedAt: new Date() } });
}

export async function deleteItems(variantIds: string[], tx?: Db) {
	if (!variantIds.length) return;
	await inTx(tx, async (t) => {
		await t.delete(inventoryItems).where(inArray(inventoryItems.variantId, variantIds));
		await t.delete(inventoryMovements).where(inArray(inventoryMovements.variantId, variantIds));
	});
}

export async function getItems(variantIds: string[], d: Db = db()) {
	if (!variantIds.length) return new Map<string, InventoryItem>();
	const rows = await d.select().from(inventoryItems).where(inArray(inventoryItems.variantId, variantIds));
	return new Map(rows.map((r) => [r.variantId, r]));
}

export const isSellable = (i: InventoryItem | undefined, quantity = 1) =>
	!i || !i.manageInventory || i.allowBackorder || i.stockedQuantity >= quantity;

export async function adjustStock(
	variantId: string,
	delta: number,
	opts: { reason?: Reason; note?: string; actorId?: string; reference?: string } = {},
	tx?: Db,
) {
	if (!Number.isInteger(delta) || delta === 0) throw invalid("Adjustment must be a non-zero integer");
	return inTx(tx, async (t) => {
		const [item] = await t
			.insert(inventoryItems)
			.values({ variantId, stockedQuantity: delta })
			.onConflictDoUpdate({ target: inventoryItems.variantId, set: { stockedQuantity: sql`${inventoryItems.stockedQuantity} + ${delta}`, updatedAt: new Date() } })
			.returning();
		await t.insert(inventoryMovements).values({
			id: newId("imov"), variantId, delta, reason: opts.reason ?? "adjustment", note: opts.note, actorId: opts.actorId, reference: opts.reference,
		});
		return item;
	});
}

export async function setStock(variantId: string, quantity: number, actorId?: string, tx?: Db) {
	if (!Number.isInteger(quantity) || quantity < 0) throw invalid("Quantity must be a non-negative integer");
	return inTx(tx, async (t) => {
		const [item] = await t.select().from(inventoryItems).where(eq(inventoryItems.variantId, variantId)).for("update");
		const current = item?.stockedQuantity ?? 0;
		if (item && current === quantity) return item;
		if (!item && quantity === 0) {
			await createItems([{ variantId, stock: 0 }], t);
			return (await getItems([variantId], t)).get(variantId)!;
		}
		return adjustStock(variantId, quantity - current, { reason: "adjustment", actorId, note: `Set to ${quantity}` }, t);
	});
}

/** Variant ids that cannot satisfy the requested quantity. */
export async function findUnavailable(lines: StockLine[], d: Db = db()) {
	const items = await getItems(lines.map((l) => l.variantId), d);
	return lines.filter((l) => !isSellable(items.get(l.variantId), l.quantity)).map((l) => l.variantId);
}

/**
 * Atomically decrement stock inside the caller's transaction (conditional UPDATE → no overselling).
 * Returns variant ids that could not be decremented.
 */
export async function reserveForOrder(tx: Db, lines: StockLine[], reference: string) {
	const failed: string[] = [];
	const items = await getItems(lines.map((l) => l.variantId), tx);
	for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
		const item = items.get(l.variantId);
		if (item && !item.manageInventory) continue;
		const updated = await tx
			.update(inventoryItems)
			.set({ stockedQuantity: sql`${inventoryItems.stockedQuantity} - ${l.quantity}`, updatedAt: new Date() })
			.where(
				item?.allowBackorder
					? eq(inventoryItems.variantId, l.variantId)
					: and(eq(inventoryItems.variantId, l.variantId), sql`${inventoryItems.stockedQuantity} >= ${l.quantity}`),
			)
			.returning({ id: inventoryItems.variantId });
		if (!updated.length) { failed.push(l.variantId); continue; }
		await tx.insert(inventoryMovements).values({ id: newId("imov"), variantId: l.variantId, delta: -l.quantity, reason: "order", reference });
	}
	return failed;
}

export async function restock(tx: Db, lines: StockLine[], reference: string) {
	const items = await getItems(lines.map((l) => l.variantId), tx);
	for (const l of lines) {
		const item = items.get(l.variantId);
		if (!item?.manageInventory) continue;
		await adjustStock(l.variantId, l.quantity, { reason: "cancel", reference }, tx);
	}
}

export async function listItems(opts: { lowStockOnly?: boolean; limit?: number } = {}) {
	return db()
		.select()
		.from(inventoryItems)
		.where(opts.lowStockOnly ? and(eq(inventoryItems.manageInventory, true), lte(inventoryItems.stockedQuantity, sql`coalesce(${inventoryItems.lowStockThreshold}, 5)`)) : undefined)
		.orderBy(asc(inventoryItems.stockedQuantity))
		.limit(Math.min(opts.limit ?? 500, 1000));
}
