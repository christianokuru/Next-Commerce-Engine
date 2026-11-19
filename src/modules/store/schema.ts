import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import type { Theme } from "./theme";

export type StoreAddress = { line1?: string; city?: string; state?: string; country?: string; postalCode?: string };

/** Single-row table (id = 'default'). */
export const storeSettings = pgTable("store_settings", {
	id: text("id").primaryKey().default("default"),
	name: text("name").notNull().default("My Store"),
	supportEmail: text("support_email"),
	logoUrl: text("logo_url"),
	storefrontUrl: text("storefront_url"),
	defaultCurrency: text("default_currency").notNull().default("NGN"),
	currencies: text("currencies").array().notNull().default(["NGN"]),
	/** Tax rate in basis points (750 = 7.5%). */
	taxRateBps: integer("tax_rate_bps").notNull().default(0),
	taxInclusive: boolean("tax_inclusive").notNull().default(true),
	paymentProviders: text("payment_providers").array().notNull().default([]),
	address: jsonb("address").$type<StoreAddress>(),
	/** Dashboard appearance (colors, fonts, style). null → default preset. */
	theme: jsonb("theme").$type<Theme>(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
