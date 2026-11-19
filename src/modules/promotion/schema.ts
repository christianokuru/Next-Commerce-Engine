import { pgTable, text, timestamp, integer, boolean, bigint } from "drizzle-orm/pg-core";

export const promotions = pgTable("promotions", {
	id: text("id").primaryKey(),
	/** Stored uppercase. */
	code: text("code").notNull().unique(),
	description: text("description"),
	type: text("type", { enum: ["percentage", "fixed", "free_shipping"] }).notNull(),
	/** percentage: 1-100; fixed: minor units in `currencyCode`; free_shipping: 0 */
	value: integer("value").notNull().default(0),
	currencyCode: text("currency_code"),
	minSubtotal: bigint("min_subtotal", { mode: "number" }),
	usageLimit: integer("usage_limit"),
	usageCount: integer("usage_count").notNull().default(0),
	startsAt: timestamp("starts_at", { withTimezone: true }),
	endsAt: timestamp("ends_at", { withTimezone: true }),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
