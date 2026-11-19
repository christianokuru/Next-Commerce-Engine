import { pgTable, text, timestamp, jsonb, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { carts } from "../cart/schema";
import { orders } from "../order/schema";

export const PAYMENT_PROVIDERS = ["paystack", "flutterwave", "stripe"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUS = [
	"pending", "captured", "failed", "canceled", "requires_action", "partially_refunded", "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const payments = pgTable(
	"payments",
	{
		id: text("id").primaryKey(),
		cartId: text("cart_id").notNull().references(() => carts.id),
		orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
		provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
		/** Our merchant reference sent to the provider (tx_ref / reference / client_reference_id). */
		reference: text("reference").notNull().unique(),
		/** Provider-side id (Stripe session/PI id, Flutterwave transaction id, Paystack id). */
		providerReference: text("provider_reference"),
		amount: bigint("amount", { mode: "number" }).notNull(),
		currencyCode: text("currency_code").notNull(),
		status: text("status", { enum: PAYMENT_STATUS }).notNull().default("pending"),
		refundedAmount: bigint("refunded_amount", { mode: "number" }).notNull().default(0),
		failureReason: text("failure_reason"),
		data: jsonb("data").$type<Record<string, unknown>>(),
		capturedAt: timestamp("captured_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
	},
	(t) => [index("payments_cart_idx").on(t.cartId), index("payments_order_idx").on(t.orderId)],
);

export const refunds = pgTable(
	"refunds",
	{
		id: text("id").primaryKey(),
		paymentId: text("payment_id").notNull().references(() => payments.id),
		amount: bigint("amount", { mode: "number" }).notNull(),
		reason: text("reason"),
		providerRefundId: text("provider_refund_id"),
		status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull().default("pending"),
		actorId: text("actor_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("refunds_payment_idx").on(t.paymentId)],
);

/** Webhook de-duplication + audit log. */
export const webhookEvents = pgTable(
	"webhook_events",
	{
		id: text("id").primaryKey(),
		provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
		eventId: text("event_id").notNull(),
		type: text("type").notNull(),
		status: text("status", { enum: ["received", "processed", "ignored", "failed"] }).notNull().default("received"),
		error: text("error"),
		receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
		processedAt: timestamp("processed_at", { withTimezone: true }),
	},
	(t) => [uniqueIndex("webhook_provider_event_uq").on(t.provider, t.eventId)],
);
