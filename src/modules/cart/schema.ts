import { pgTable, text, timestamp, integer, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Address } from "../../lib/address";

export const carts = pgTable(
	"carts",
	{
		id: text("id").primaryKey(),
		// Links to other modules are plain ids (validated in workflows), never FKs.
		customerId: text("customer_id"),
		email: text("email"),
		currencyCode: text("currency_code").notNull(),
		shippingAddress: jsonb("shipping_address").$type<Address>(),
		billingAddress: jsonb("billing_address").$type<Address>(),
		shippingOptionId: text("shipping_option_id"),
		promotionId: text("promotion_id"),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
	},
	(t) => [index("carts_customer_idx").on(t.customerId)],
);

export const cartLineItems = pgTable(
	"cart_line_items",
	{
		id: text("id").primaryKey(),
		cartId: text("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
		variantId: text("variant_id").notNull(),
		quantity: integer("quantity").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("cart_item_variant_uq").on(t.cartId, t.variantId),
		check("cart_item_qty_positive", sql`${t.quantity} > 0`),
	],
);
