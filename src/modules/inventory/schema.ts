import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { productVariants } from "../product/schema";

/** Single-location stock level per variant. */
export const inventoryLevels = pgTable("inventory_levels", {
	variantId: text("variant_id").primaryKey().references(() => productVariants.id, { onDelete: "cascade" }),
	stockedQuantity: integer("stocked_quantity").notNull().default(0),
	lowStockThreshold: integer("low_stock_threshold"),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Append-only stock ledger for auditability. */
export const inventoryMovements = pgTable(
	"inventory_movements",
	{
		id: text("id").primaryKey(),
		variantId: text("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
		delta: integer("delta").notNull(),
		reason: text("reason", { enum: ["adjustment", "order", "cancel", "restock"] }).notNull(),
		reference: text("reference"),
		note: text("note"),
		actorId: text("actor_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("inv_mov_variant_idx").on(t.variantId)],
);
