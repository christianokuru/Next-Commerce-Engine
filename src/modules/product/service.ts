/**
 * Product module — catalog only (products, variants, prices, options, images, categories, collections).
 * Owns no stock data and imports no other module. Cross-module work lives in src/workflows.
 */
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, inTx, type Db } from "@/db";
import {
	products, productVariants, productVariantPrices, productImages, productOptions,
	productCategories, productCollections, productCategoryLinks,
} from "./schema";
import { newId } from "@/lib/id";
import { slugify } from "@/lib/slug";
import { notFound, invalid, CommerceError } from "@/lib/errors";

export type ProductStatus = "draft" | "published" | "archived";
export type Product = typeof products.$inferSelect;
export type Variant = typeof productVariants.$inferSelect;

export type PriceInput = { currencyCode: string; amount: number; compareAtAmount?: number | null };
export type VariantInput = {
	title?: string;
	sku?: string | null;
	options?: Record<string, string>;
	prices: PriceInput[];
	weightGrams?: number | null;
};
export type ProductInput = {
	title: string;
	handle?: string;
	subtitle?: string | null;
	description?: string | null;
	status?: ProductStatus;
	thumbnail?: string | null;
	collectionId?: string | null;
	categoryIds?: string[];
	options?: { title: string; values: string[] }[];
	variants?: VariantInput[];
};

type HandleTable = typeof products | typeof productCategories | typeof productCollections;

async function uniqueHandle(d: Db, base: string, table: HandleTable, excludeId?: string) {
	const root = slugify(base);
	for (let i = 0; i < 50; i++) {
		const candidate = i === 0 ? root : `${root}-${i + 1}`;
		const rows = await d.select({ id: table.id }).from(table).where(eq(table.handle, candidate)).limit(1);
		if (!rows.length || rows[0].id === excludeId) return candidate;
	}
	return `${root}-${Date.now().toString(36)}`;
}

function normalizePrices(prices: PriceInput[]) {
	const seen = new Set<string>();
	return prices.map((p) => {
		const currencyCode = p.currencyCode.toUpperCase();
		if (seen.has(currencyCode)) throw invalid(`Duplicate price for ${currencyCode}`);
		seen.add(currencyCode);
		if (!Number.isInteger(p.amount) || p.amount < 0) throw invalid("Price amount must be a non-negative integer (minor units)");
		return { currencyCode, amount: p.amount, compareAtAmount: p.compareAtAmount ?? null };
	});
}

/** Map unique-constraint violations to a domain conflict. */
export function rethrowUnique(e: unknown): never {
	const text = String((e as { message?: string })?.message ?? e) + String((e as { cause?: { message?: string } })?.cause?.message ?? "");
	if (/unique|duplicate/i.test(text)) throw new CommerceError("conflict", "A record with the same handle, SKU or code already exists");
	throw e;
}

async function insertVariant(tx: Db, productId: string, v: VariantInput, rank: number) {
	const id = newId("variant");
	const title = v.title?.trim() || Object.values(v.options ?? {}).join(" / ") || "Default";
	await tx.insert(productVariants).values({
		id, productId, title, sku: v.sku?.trim() || null, options: v.options ?? {}, weightGrams: v.weightGrams ?? null, rank,
	});
	const prices = normalizePrices(v.prices);
	if (prices.length) await tx.insert(productVariantPrices).values(prices.map((p) => ({ id: newId("price"), variantId: id, ...p })));
	return id;
}

/** Returns the product id and the new variant ids (same order as input). */
export async function createProduct(input: ProductInput, tx?: Db) {
	if (!input.title?.trim()) throw invalid("Title is required");
	return inTx(tx, async (t) => {
		const id = newId("prod");
		await t.insert(products).values({
			id,
			title: input.title.trim(),
			handle: await uniqueHandle(t, input.handle || input.title, products),
			subtitle: input.subtitle ?? null,
			description: input.description ?? null,
			status: input.status ?? "draft",
			thumbnail: input.thumbnail ?? null,
			collectionId: input.collectionId || null,
		});
		if (input.options?.length)
			await t.insert(productOptions).values(input.options.map((o, i) => ({ id: newId("opt"), productId: id, title: o.title, values: o.values, rank: i })));
		const variantIds: string[] = [];
		for (const [i, v] of (input.variants ?? []).entries()) variantIds.push(await insertVariant(t, id, v, i));
		if (input.categoryIds?.length)
			await t.insert(productCategoryLinks).values(input.categoryIds.map((categoryId) => ({ productId: id, categoryId })));
		return { id, variantIds };
	}).catch(rethrowUnique);
}

export async function updateProduct(id: string, input: Partial<Omit<ProductInput, "variants" | "options">>, tx?: Db) {
	await inTx(tx, async (t) => {
		const [existing] = await t.select({ id: products.id }).from(products).where(eq(products.id, id));
		if (!existing) throw notFound("Product");
		const patch: Partial<typeof products.$inferInsert> = {};
		if (input.title !== undefined) patch.title = input.title.trim();
		if (input.handle !== undefined) patch.handle = await uniqueHandle(t, input.handle || input.title || id, products, id);
		if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
		if (input.description !== undefined) patch.description = input.description;
		if (input.status !== undefined) patch.status = input.status;
		if (input.thumbnail !== undefined) patch.thumbnail = input.thumbnail;
		if (input.collectionId !== undefined) patch.collectionId = input.collectionId || null;
		if (Object.keys(patch).length) await t.update(products).set(patch).where(eq(products.id, id));
		if (input.categoryIds) {
			await t.delete(productCategoryLinks).where(eq(productCategoryLinks.productId, id));
			if (input.categoryIds.length) await t.insert(productCategoryLinks).values(input.categoryIds.map((categoryId) => ({ productId: id, categoryId })));
		}
	}).catch(rethrowUnique);
}

/** Deletes the product and returns its variant ids + image storage keys so workflows can clean up other modules. */
export async function deleteProduct(id: string, tx?: Db) {
	return inTx(tx, async (t) => {
		const variants = await t.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, id));
		const images = await t.select({ key: productImages.storageKey }).from(productImages).where(eq(productImages.productId, id));
		await t.delete(products).where(eq(products.id, id));
		return { variantIds: variants.map((v) => v.id), storageKeys: images.map((i) => i.key).filter((k): k is string => Boolean(k)) };
	});
}

export async function setProductOptions(productId: string, options: { title: string; values: string[] }[]) {
	await inTx(undefined, async (t) => {
		await t.delete(productOptions).where(eq(productOptions.productId, productId));
		if (options.length)
			await t.insert(productOptions).values(options.map((o, i) => ({ id: newId("opt"), productId, title: o.title.trim(), values: o.values, rank: i })));
	});
}

export async function addVariant(productId: string, v: VariantInput, tx?: Db) {
	return inTx(tx, async (t) => {
		const [p] = await t.select({ id: products.id }).from(products).where(eq(products.id, productId));
		if (!p) throw notFound("Product");
		const [{ n }] = await t.select({ n: count() }).from(productVariants).where(eq(productVariants.productId, productId));
		return insertVariant(t, productId, v, n);
	}).catch(rethrowUnique);
}

export async function updateVariant(variantId: string, v: Partial<VariantInput>, tx?: Db) {
	await inTx(tx, async (t) => {
		const patch: Partial<typeof productVariants.$inferInsert> = {};
		if (v.title !== undefined) patch.title = v.title;
		if (v.sku !== undefined) patch.sku = v.sku?.trim() || null;
		if (v.options !== undefined) patch.options = v.options;
		if (v.weightGrams !== undefined) patch.weightGrams = v.weightGrams;
		const [exists] = await t.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.id, variantId));
		if (!exists) throw notFound("Variant");
		if (Object.keys(patch).length) await t.update(productVariants).set(patch).where(eq(productVariants.id, variantId));
		if (v.prices) {
			const prices = normalizePrices(v.prices);
			await t.delete(productVariantPrices).where(eq(productVariantPrices.variantId, variantId));
			if (prices.length) await t.insert(productVariantPrices).values(prices.map((p) => ({ id: newId("price"), variantId, ...p })));
		}
	}).catch(rethrowUnique);
}

export async function deleteVariant(variantId: string, tx?: Db) {
	await (tx ?? db()).delete(productVariants).where(eq(productVariants.id, variantId));
}

export async function addProductImage(productId: string, image: { url: string; storageKey?: string; alt?: string }) {
	const [{ n }] = await db().select({ n: count() }).from(productImages).where(eq(productImages.productId, productId));
	const id = newId("img");
	await db().insert(productImages).values({ id, productId, url: image.url, storageKey: image.storageKey, alt: image.alt, rank: n });
	if (n === 0) await db().update(products).set({ thumbnail: image.url }).where(eq(products.id, productId));
	return id;
}

export async function deleteProductImage(imageId: string) {
	const [img] = await db().delete(productImages).where(eq(productImages.id, imageId)).returning();
	return img ?? null;
}

// ---------- Queries (catalog data only) ----------

const detailWith = {
	variants: { orderBy: asc(productVariants.rank), with: { prices: true } },
	images: { orderBy: asc(productImages.rank) },
	options: { orderBy: asc(productOptions.rank) },
} as const;

export async function getProduct(id: string) {
	const p = await db().query.products.findFirst({
		where: eq(products.id, id),
		with: { ...detailWith, categoryLinks: true, collection: true },
	});
	return p ?? null;
}
export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

export async function listProducts(opts: { q?: string; status?: ProductStatus; limit?: number; offset?: number } = {}) {
	const conds = [];
	if (opts.status) conds.push(eq(products.status, opts.status));
	if (opts.q) conds.push(or(ilike(products.title, `%${opts.q}%`), ilike(products.handle, `%${opts.q}%`)));
	const where = conds.length ? and(...conds) : undefined;
	const [rows, [{ total }]] = await Promise.all([
		db().query.products.findMany({
			where, orderBy: desc(products.createdAt), limit: Math.min(opts.limit ?? 20, 100), offset: opts.offset ?? 0,
			with: { variants: { columns: { id: true } } },
		}),
		db().select({ total: count() }).from(products).where(where),
	]);
	return { products: rows, count: total };
}

export async function listPublished(opts: { q?: string; categoryHandle?: string; collectionHandle?: string; limit?: number; offset?: number }) {
	const conds = [eq(products.status, "published")];
	if (opts.q) conds.push(ilike(products.title, `%${opts.q}%`));
	if (opts.collectionHandle)
		conds.push(inArray(products.collectionId, db().select({ id: productCollections.id }).from(productCollections).where(eq(productCollections.handle, opts.collectionHandle))));
	if (opts.categoryHandle)
		conds.push(
			inArray(
				products.id,
				db().select({ id: productCategoryLinks.productId }).from(productCategoryLinks)
					.innerJoin(productCategories, eq(productCategories.id, productCategoryLinks.categoryId))
					.where(and(eq(productCategories.handle, opts.categoryHandle), eq(productCategories.isActive, true))),
			),
		);
	const where = and(...conds);
	const limit = Math.min(opts.limit ?? 20, 100);
	const [rows, [{ total }]] = await Promise.all([
		db().query.products.findMany({ where, orderBy: desc(products.createdAt), limit, offset: opts.offset ?? 0, with: detailWith }),
		db().select({ total: count() }).from(products).where(where),
	]);
	return { products: rows, count: total, limit, offset: opts.offset ?? 0 };
}

export async function getPublishedByHandle(handle: string) {
	const p = await db().query.products.findFirst({ where: and(eq(products.handle, handle), eq(products.status, "published")), with: { ...detailWith, collection: true } });
	return p ?? null;
}
export type CatalogProduct = Awaited<ReturnType<typeof listPublished>>["products"][number];

/** Variant facts other modules need for pricing a cart. */
export async function getVariantsForCart(variantIds: string[], currency: string, d: Db = db()) {
	if (!variantIds.length) return [];
	return d
		.select({
			variantId: productVariants.id, productId: products.id, title: products.title, status: products.status,
			thumbnail: products.thumbnail, variantTitle: productVariants.title, sku: productVariants.sku,
			unitPrice: productVariantPrices.amount,
		})
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.leftJoin(productVariantPrices, and(eq(productVariantPrices.variantId, productVariants.id), eq(productVariantPrices.currencyCode, currency.toUpperCase())))
		.where(inArray(productVariants.id, variantIds));
}

export async function variantsExist(variantIds: string[], d: Db = db()) {
	if (!variantIds.length) return new Set<string>();
	const rows = await d.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.id, variantIds));
	return new Set(rows.map((r) => r.id));
}

export async function getVariantLabels(variantIds: string[]) {
	if (!variantIds.length) return [];
	return db()
		.select({ variantId: productVariants.id, variantTitle: productVariants.title, sku: productVariants.sku, productId: products.id, productTitle: products.title })
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.where(inArray(productVariants.id, variantIds));
}

export async function listAllVariantLabels(limit = 500) {
	return db()
		.select({ variantId: productVariants.id, variantTitle: productVariants.title, sku: productVariants.sku, productId: products.id, productTitle: products.title })
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.orderBy(asc(products.title), asc(productVariants.rank))
		.limit(limit);
}

// ---------- Categories & collections ----------

export async function listCategories(opts: { activeOnly?: boolean } = {}) {
	return db().select().from(productCategories).where(opts.activeOnly ? eq(productCategories.isActive, true) : undefined)
		.orderBy(asc(productCategories.rank), asc(productCategories.name));
}

export async function createCategory(input: { name: string; handle?: string; description?: string | null; parentId?: string | null; isActive?: boolean }) {
	const id = newId("pcat");
	await db().insert(productCategories).values({
		id, name: input.name.trim(), handle: await uniqueHandle(db(), input.handle || input.name, productCategories),
		description: input.description ?? null, parentId: input.parentId || null, isActive: input.isActive ?? true,
	});
	return id;
}

export async function updateCategory(id: string, input: { name?: string; description?: string | null; parentId?: string | null; isActive?: boolean }) {
	if (input.parentId === id) throw invalid("A category cannot be its own parent");
	const r = await db().update(productCategories)
		.set({ ...input, parentId: input.parentId === undefined ? undefined : input.parentId || null })
		.where(eq(productCategories.id, id)).returning({ id: productCategories.id });
	if (!r.length) throw notFound("Category");
}

export async function deleteCategory(id: string) {
	await db().delete(productCategories).where(eq(productCategories.id, id));
}

export async function listCollections() {
	return db()
		.select({
			id: productCollections.id, title: productCollections.title, handle: productCollections.handle, description: productCollections.description,
			productCount: sql<number>`(select count(*)::int from ${products} where ${products.collectionId} = ${productCollections.id})`,
		})
		.from(productCollections)
		.orderBy(asc(productCollections.title));
}

export async function createCollection(input: { title: string; handle?: string; description?: string | null }) {
	const id = newId("pcol");
	await db().insert(productCollections).values({
		id, title: input.title.trim(), handle: await uniqueHandle(db(), input.handle || input.title, productCollections), description: input.description ?? null,
	});
	return id;
}

export async function updateCollection(id: string, input: { title?: string; description?: string | null }) {
	const r = await db().update(productCollections).set(input).where(eq(productCollections.id, id)).returning({ id: productCollections.id });
	if (!r.length) throw notFound("Collection");
}

export async function deleteCollection(id: string) {
	await db().delete(productCollections).where(eq(productCollections.id, id));
}
