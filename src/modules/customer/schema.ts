import { pgTable, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";

export type { Address } from "../../lib/address";
import type { Address } from "../../lib/address";

export const customers = pgTable("customers", {
	id: text("id").primaryKey(),
	/** Link → auth.user (no FK: modules are isolated). */
	userId: text("user_id").unique(),
	email: text("email").notNull().unique(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	phone: text("phone"),
	metadata: jsonb("metadata").$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const customerAddresses = pgTable(
	"customer_addresses",
	{
		id: text("id").primaryKey(),
		customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		address: jsonb("address").$type<Address>().notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("cus_addr_customer_idx").on(t.customerId)],
);
