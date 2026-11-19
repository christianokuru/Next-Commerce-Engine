import { pgTable, text, timestamp, integer, jsonb, bigint, boolean, index } from "drizzle-orm/pg-core";
import type { Address } from "../../lib/address";

export type ShippingMethodSnapshot = { optionId: string; name: string; amount: number };
export type PromotionSnapshot = { id: string; code: string; type: string; value: number };

export const ORDER_STATUS = ["pending", "completed", "canceled", "requires_action"] as const;
export const FULFILLMENT_STATUS = ["not_fulfilled", "fulfilled", "shipped", "delivered", "canceled"] as const;
export const ORDER_PAYMENT_STATUS = ["captured", "partially_refunded", "refunded"] as const;

export const orders = pgTable(
	"orders",
	{
		id: text("id").primaryKey(),
		displayId: integer("display_id").generatedAlwaysAsIdentity({ startWith: 1001 }).notNull().unique(),
		cartId: text("cart_id").notNull().unique(),
		customerId: text("customer_id"),
		email: text("email").notNull(),
		currencyCode: text("currency_code").notNull(),
		status: text("status", { enum: ORDER_STATUS }).notNull().default("pending"),
		paymentStatus: text("payment_status", { enum: ORDER_PAYMENT_STATUS }).notNull().default("captured"),
		fulfillmentStatus: text("fulfillment_status", { enum: FULFILLMENT_STATUS }).notNull().default("not_fulfilled"),
		subtotal: bigint("subtotal", { mode: "number" }).notNull(),
		discountTotal: bigint("discount_total", { mode: "number" }).notNull().default(0),
		shippingTotal: bigint("shipping_total", { mode: "number" }).notNull().default(0),
		taxTotal: bigint("tax_total", { mode: "number" }).notNull().default(0),
		total: bigint("total", { mode: "number" }).notNull(),
		refundedTotal: bigint("refunded_total", { mode: "number" }).notNull().default(0),
		taxInclusive: boolean("tax_inclusive").notNull().default(true),
		shippingAddress: jsonb("shipping_address").$type<Address>(),
		billingAddress: jsonb("billing_address").$type<Address>(),
		shippingMethod: jsonb("shipping_method").$type<ShippingMethodSnapshot>(),
		promotion: jsonb("promotion").$type<PromotionSnapshot>(),
		trackingNumber: text("tracking_number"),
		carrier: text("carrier"),
		note: text("note"),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
	},
	(t) => [
		index("orders_customer_idx").on(t.customerId),
		index("orders_email_idx").on(t.email),
		index("orders_created_idx").on(t.createdAt),
	],
);

export const orderLineItems = pgTable(
	"order_line_items",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
		productId: text("product_id"),
		variantId: text("variant_id"),
		title: text("title").notNull(),
		variantTitle: text("variant_title"),
		sku: text("sku"),
		thumbnail: text("thumbnail"),
		unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
		quantity: integer("quantity").notNull(),
		total: bigint("total", { mode: "number" }).notNull(),
	},
	(t) => [index("oli_order_idx").on(t.orderId)],
);

export const orderEvents = pgTable(
	"order_events",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		data: jsonb("data").$type<Record<string, unknown>>(),
		actorId: text("actor_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("oevt_order_idx").on(t.orderId)],
);
