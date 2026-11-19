import { pgTable, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

/** Stock record per product variant (single location). Linked to product module by `variantId` only. */
export const inventoryItems = pgTable("inventory_items", {
	variantId: text("variant_id").primaryKey(),
	stockedQuantity: integer("stocked_quantity").notNull().default(0),
	manageInventory: boolean("manage_inventory").notNull().default(true),
	allowBackorder: boolean("allow_backorder").notNull().default(false),
	lowStockThreshold: integer("low_stock_threshold"),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Append-only stock ledger for auditability. */
export const inventoryMovements = pgTable(
	"inventory_movements",
	{
		id: text("id").primaryKey(),
		variantId: text("variant_id").notNull(),
		delta: integer("delta").notNull(),
		reason: text("reason", { enum: ["adjustment", "order", "cancel", "restock"] }).notNull(),
		reference: text("reference"),
		note: text("note"),
		actorId: text("actor_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("inv_mov_variant_idx").on(t.variantId)],
);
