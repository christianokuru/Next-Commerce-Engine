import { pgTable, text, timestamp, integer, boolean, bigint, index } from "drizzle-orm/pg-core";

export const shippingZones = pgTable("shipping_zones", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	/** ISO 3166-1 alpha-2, uppercase. */
	countries: text("countries").array().notNull().default([]),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shippingOptions = pgTable(
	"shipping_options",
	{
		id: text("id").primaryKey(),
		zoneId: text("zone_id").notNull().references(() => shippingZones.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		currencyCode: text("currency_code").notNull(),
		amount: bigint("amount", { mode: "number" }).notNull(),
		/** Free when cart subtotal >= this amount. */
		freeOverAmount: bigint("free_over_amount", { mode: "number" }),
		minDeliveryDays: integer("min_delivery_days"),
		maxDeliveryDays: integer("max_delivery_days"),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("so_zone_idx").on(t.zoneId)],
);
