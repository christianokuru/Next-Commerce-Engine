import {
	pgTable, text, timestamp, integer, boolean, jsonb, bigint, primaryKey, index, uniqueIndex, type AnyPgColumn,
} from "drizzle-orm/pg-core";

const ts = {
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const productCategories = pgTable("product_categories", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	handle: text("handle").notNull().unique(),
	description: text("description"),
	parentId: text("parent_id").references((): AnyPgColumn => productCategories.id, { onDelete: "set null" }),
	rank: integer("rank").notNull().default(0),
	isActive: boolean("is_active").notNull().default(true),
	...ts,
});

export const productCollections = pgTable("product_collections", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	handle: text("handle").notNull().unique(),
	description: text("description"),
	...ts,
});

export const products = pgTable(
	"products",
	{
		id: text("id").primaryKey(),
		title: text("title").notNull(),
		handle: text("handle").notNull().unique(),
		subtitle: text("subtitle"),
		description: text("description"),
		status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
		thumbnail: text("thumbnail"),
		collectionId: text("collection_id").references(() => productCollections.id, { onDelete: "set null" }),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...ts,
	},
	(t) => [index("products_status_idx").on(t.status), index("products_collection_idx").on(t.collectionId)],
);

export const productCategoryLinks = pgTable(
	"product_category_links",
	{
		productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
		categoryId: text("category_id").notNull().references(() => productCategories.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.productId, t.categoryId] }), index("pcl_category_idx").on(t.categoryId)],
);

/** e.g. { title: "Size", values: ["S","M","L"] } */
export const productOptions = pgTable("product_options", {
	id: text("id").primaryKey(),
	productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	values: text("values").array().notNull().default([]),
	rank: integer("rank").notNull().default(0),
});

export const productVariants = pgTable(
	"product_variants",
	{
		id: text("id").primaryKey(),
		productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		sku: text("sku").unique(),
		barcode: text("barcode"),
		/** Option title -> value, e.g. { Size: "M" } */
		options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
		weightGrams: integer("weight_grams"),
		rank: integer("rank").notNull().default(0),
		...ts,
	},
	(t) => [index("variants_product_idx").on(t.productId)],
);

export const productVariantPrices = pgTable(
	"product_variant_prices",
	{
		id: text("id").primaryKey(),
		variantId: text("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
		currencyCode: text("currency_code").notNull(),
		amount: bigint("amount", { mode: "number" }).notNull(),
		compareAtAmount: bigint("compare_at_amount", { mode: "number" }),
	},
	(t) => [uniqueIndex("variant_price_currency_uq").on(t.variantId, t.currencyCode)],
);

export const productImages = pgTable(
	"product_images",
	{
		id: text("id").primaryKey(),
		productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		storageKey: text("storage_key"),
		alt: text("alt"),
		rank: integer("rank").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("images_product_idx").on(t.productId)],
);
