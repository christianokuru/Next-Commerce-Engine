import { pgTable, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "../auth/schema";

export type Address = {
	firstName: string;
	lastName: string;
	company?: string | null;
	address1: string;
	address2?: string | null;
	city: string;
	province?: string | null;
	postalCode?: string | null;
	countryCode: string;
	phone?: string | null;
};

export const customers = pgTable("customers", {
	id: text("id").primaryKey(),
	userId: text("user_id").unique().references(() => user.id, { onDelete: "set null" }),
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
