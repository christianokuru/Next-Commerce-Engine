import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, transaction, type Db } from "@/db";
import {
	products, productVariants, productVariantPrices, productImages, productOptions,
	productCategories, productCollections, productCategoryLinks,
} from "./schema";
import { inventoryLevels } from "../inventory/schema";
import { newId } from "@/lib/id";
import { slugify } from "@/lib/slug";
import { notFound, invalid, CommerceError } from "@/lib/errors";
import { invalidate, CacheTags } from "@/lib/cache";

export type ProductStatus = "draft" | "published" | "archived";

export type VariantInput = {
	title?: string;
	sku?: string | null;
	options?: Record<string, string>;
	prices: { currencyCode: string; amount: number; compareAtAmount?: number | null }[];
	stock?: number;
	manageInventory?: boolean;
	allowBackorder?: boolean;
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

async function uniqueHandle(d: Db, base: string, table: typeof products | typeof productCategories | typeof productCollections, excludeId?: string) {
	const root = slugify(base);
	for (let i = 0; i < 50; i++) {
		const candidate = i === 0 ? root : `${root}-${i + 1}`;
		const rows = await d.select({ id: table.id }).from(table).where(eq(table.handle, candidate)).limit(1);
		if (!rows.length || rows[0].id === excludeId) return candidate;
	}
	return `${root}-${Date.now().toString(36)}`;
}

function normalizePrices(prices: VariantInput["prices"]) {
	const seen = new Set<string>();
	return prices.map((p) => {
		const currencyCode = p.currencyCode.toUpperCase();
		if (seen.has(currencyCode)) throw invalid(`Duplicate price for ${currencyCode}`);
		seen.add(currencyCode);
		if (!Number.isInteger(p.amount) || p.amount < 0) throw invalid("Price amount must be a non-negative integer (minor units)");
		return { currencyCode, amount: p.amount, compareAtAmount: p.compareAtAmount ?? null };
	});
}

async function insertVariant(tx: Db, productId: string, v: VariantInput, rank: number) {
	const id = newId("variant");
	const title = v.title?.trim() || Object.values(v.options ?? {}).join(" / ") || "Default";
	await tx.insert(productVariants).values({
		id,
		productId,
		title,
		sku: v.sku?.trim() || null,
		options: v.options ?? {},
		manageInventory: v.manageInventory ?? true,
		allowBackorder: v.allowBackorder ?? false,
		weightGrams: v.weightGrams ?? null,
		rank,
	});
	const prices = normalizePrices(v.prices);
	if (prices.length) {
		await tx.insert(productVariantPrices).values(prices.map((p) => ({ id: newId("price"), variantId: id, ...p })));
	}
	await tx.insert(inventoryLevels).values({ variantId: id, stockedQuantity: Math.max(0, Math.trunc(v.stock ?? 0)) });
	return id;
}

function wrapUnique(e: unknown): never {
	const msg = String((e as { message?: string })?.message ?? e);
	const cause = String((e as { cause?: { message?: string } })?.cause?.message ?? "");
	if (/unique|duplicate/i.test(msg + cause)) throw new CommerceError("conflict", "A record with the same handle or SKU already exists");
	throw e;
}

export async function createProduct(input: ProductInput) {
	if (!input.title?.trim()) throw invalid("Title is required");
	try {
		const id = await transaction(async (tx) => {
			const id = newId("prod");
			const handle = await uniqueHandle(tx, input.handle || input.title, products);
			await tx.insert(products).values({
				id,
				title: input.title.trim(),
				handle,
				subtitle: input.subtitle ?? null,
				description: input.description ?? null,
				status: input.status ?? "draft",
				thumbnail: input.thumbnail ?? null,
				collectionId: input.collectionId || null,
			});
			if (input.options?.length) {
				await tx.insert(productOptions).values(
					input.options.map((o, i) => ({ id: newId("opt"), productId: id, title: o.title, values: o.values, rank: i })),
				);
			}
			const variants = input.variants?.length ? input.variants : [];
			for (const [i, v] of variants.entries()) await insertVariant(tx, id, v, i);
			if (input.categoryIds?.length) {
				await tx.insert(productCategoryLinks).values(input.categoryIds.map((categoryId) => ({ productId: id, categoryId })));
			}
			return id;
		});
		await invalidate(CacheTags.catalog);
		return id;
	} catch (e) {
		wrapUnique(e);
	}
}

export async function updateProduct(id: string, input: Partial<Omit<ProductInput, "variants" | "options">>) {
	try {
		await transaction(async (tx) => {
			const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.id, id));
			if (!existing) throw notFound("Product");
			const patch: Partial<typeof products.$inferInsert> = {};
			if (input.title !== undefined) patch.title = input.title.trim();
			if (input.handle !== undefined) patch.handle = await uniqueHandle(tx, input.handle || input.title || id, products, id);
			if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
			if (input.description !== undefined) patch.description = input.description;
			if (input.status !== undefined) patch.status = input.status;
			if (input.thumbnail !== undefined) patch.thumbnail = input.thumbnail;
			if (input.collectionId !== undefined) patch.collectionId = input.collectionId || null;
			if (Object.keys(patch).length) await tx.update(products).set(patch).where(eq(products.id, id));
			if (input.categoryIds) {
				await tx.delete(productCategoryLinks).where(eq(productCategoryLinks.productId, id));
				if (input.categoryIds.length)
					await tx.insert(productCategoryLinks).values(input.categoryIds.map((categoryId) => ({ productId: id, categoryId })));
			}
		});
		await invalidate(CacheTags.catalog);
	} catch (e) {
		wrapUnique(e);
	}
}

export async function deleteProduct(id: string) {
	await db().delete(products).where(eq(products.id, id));
	await invalidate(CacheTags.catalog);
}

export async function setProductOptions(productId: string, options: { title: string; values: string[] }[]) {
	await transaction(async (tx) => {
		await tx.delete(productOptions).where(eq(productOptions.productId, productId));
		if (options.length)
			await tx.insert(productOptions).values(
				options.map((o, i) => ({ id: newId("opt"), productId, title: o.title.trim(), values: o.values, rank: i })),
			);
	});
	await invalidate(CacheTags.catalog);
}

export async function addVariant(productId: string, v: VariantInput) {
	try {
		const id = await transaction(async (tx) => {
			const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId));
			if (!p) throw notFound("Product");
			const [{ n }] = await tx.select({ n: count() }).from(productVariants).where(eq(productVariants.productId, productId));
			return insertVariant(tx, productId, v, n);
		});
		await invalidate(CacheTags.catalog);
		return id;
	} catch (e) {
		wrapUnique(e);
	}
}

export async function updateVariant(
	variantId: string,
	v: Partial<Omit<VariantInput, "stock">>,
) {
	try {
		await transaction(async (tx) => {
			const patch: Partial<typeof productVariants.$inferInsert> = {};
			if (v.title !== undefined) patch.title = v.title;
			if (v.sku !== undefined) patch.sku = v.sku?.trim() || null;
			if (v.options !== undefined) patch.options = v.options;
			if (v.manageInventory !== undefined) patch.manageInventory = v.manageInventory;
			if (v.allowBackorder !== undefined) patch.allowBackorder = v.allowBackorder;
			if (v.weightGrams !== undefined) patch.weightGrams = v.weightGrams;
			if (Object.keys(patch).length) {
				const r = await tx.update(productVariants).set(patch).where(eq(productVariants.id, variantId)).returning({ id: productVariants.id });
				if (!r.length) throw notFound("Variant");
			}
			if (v.prices) {
				const prices = normalizePrices(v.prices);
				await tx.delete(productVariantPrices).where(eq(productVariantPrices.variantId, variantId));
				if (prices.length)
					await tx.insert(productVariantPrices).values(prices.map((p) => ({ id: newId("price"), variantId, ...p })));
			}
		});
		await invalidate(CacheTags.catalog);
	} catch (e) {
		wrapUnique(e);
	}
}

export async function deleteVariant(variantId: string) {
	await db().delete(productVariants).where(eq(productVariants.id, variantId));
	await invalidate(CacheTags.catalog);
}

export async function addProductImage(productId: string, image: { url: string; storageKey?: string; alt?: string }) {
	const [{ n }] = await db().select({ n: count() }).from(productImages).where(eq(productImages.productId, productId));
	const id = newId("img");
	await db().insert(productImages).values({ id, productId, url: image.url, storageKey: image.storageKey, alt: image.alt, rank: n });
	if (n === 0) await db().update(products).set({ thumbnail: image.url }).where(eq(products.id, productId));
	await invalidate(CacheTags.catalog);
	return id;
}

export async function deleteProductImage(imageId: string) {
	const [img] = await db().delete(productImages).where(eq(productImages.id, imageId)).returning();
	await invalidate(CacheTags.catalog);
	return img;
}

// ---------- Queries ----------

export async function getProduct(id: string) {
	const p = await db().query.products.findFirst({
		where: eq(products.id, id),
		with: {
			variants: { orderBy: asc(productVariants.rank), with: { prices: true, inventory: true } },
			images: { orderBy: asc(productImages.rank) },
			options: { orderBy: asc(productOptions.rank) },
			categoryLinks: true,
			collection: true,
		},
	});
	return p ?? null;
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

export async function listProducts(opts: { q?: string; status?: ProductStatus; limit?: number; offset?: number } = {}) {
	const conds = [];
	if (opts.status) conds.push(eq(products.status, opts.status));
	if (opts.q) conds.push(or(ilike(products.title, `%${opts.q}%`), ilike(products.handle, `%${opts.q}%`)));
	const where = conds.length ? and(...conds) : undefined;
	const limit = Math.min(opts.limit ?? 20, 100);
	const [rows, [{ total }]] = await Promise.all([
		db().query.products.findMany({
			where,
			orderBy: desc(products.createdAt),
			limit,
			offset: opts.offset ?? 0,
			with: { variants: { columns: { id: true }, with: { inventory: true } } },
		}),
		db().select({ total: count() }).from(products).where(where),
	]);
	return { products: rows, count: total };
}

/** Public catalog query used by the Store API. */
export async function listPublishedProducts(opts: {
	currency: string;
	q?: string;
	categoryHandle?: string;
	collectionHandle?: string;
	limit?: number;
	offset?: number;
}) {
	const conds = [eq(products.status, "published")];
	if (opts.q) conds.push(ilike(products.title, `%${opts.q}%`));
	if (opts.collectionHandle) {
		conds.push(
			inArray(products.collectionId, db().select({ id: productCollections.id }).from(productCollections).where(eq(productCollections.handle, opts.collectionHandle))),
		);
	}
	if (opts.categoryHandle) {
		conds.push(
			inArray(
				products.id,
				db()
					.select({ id: productCategoryLinks.productId })
					.from(productCategoryLinks)
					.innerJoin(productCategories, eq(productCategories.id, productCategoryLinks.categoryId))
					.where(and(eq(productCategories.handle, opts.categoryHandle), eq(productCategories.isActive, true))),
			),
		);
	}
	const where = and(...conds);
	const limit = Math.min(opts.limit ?? 20, 100);
	const [rows, [{ total }]] = await Promise.all([
		db().query.products.findMany({
			where,
			orderBy: desc(products.createdAt),
			limit,
			offset: opts.offset ?? 0,
			with: {
				variants: { orderBy: asc(productVariants.rank), with: { prices: true, inventory: true } },
				images: { orderBy: asc(productImages.rank) },
				options: { orderBy: asc(productOptions.rank) },
			},
		}),
		db().select({ total: count() }).from(products).where(where),
	]);
	return { products: rows.map((p) => toStoreProduct(p, opts.currency)), count: total, limit, offset: opts.offset ?? 0 };
}

export async function getPublishedProductByHandle(handle: string, currency: string) {
	const p = await db().query.products.findFirst({
		where: and(eq(products.handle, handle), eq(products.status, "published")),
		with: {
			variants: { orderBy: asc(productVariants.rank), with: { prices: true, inventory: true } },
			images: { orderBy: asc(productImages.rank) },
			options: { orderBy: asc(productOptions.rank) },
			collection: true,
		},
	});
	return p ? toStoreProduct(p, currency) : null;
}

type ProductWithVariants = typeof products.$inferSelect & {
	variants: (typeof productVariants.$inferSelect & {
		prices: (typeof productVariantPrices.$inferSelect)[];
		inventory: typeof inventoryLevels.$inferSelect | null;
	})[];
	images: (typeof productImages.$inferSelect)[];
	options: (typeof productOptions.$inferSelect)[];
};

/** Strip internal fields; expose only the requested currency and stock availability (not counts). */
function toStoreProduct(p: ProductWithVariants, currency: string) {
	const cur = currency.toUpperCase();
	return {
		id: p.id,
		title: p.title,
		handle: p.handle,
		subtitle: p.subtitle,
		description: p.description,
		thumbnail: p.thumbnail,
		images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
		options: p.options.map((o) => ({ title: o.title, values: o.values })),
		variants: p.variants.map((v) => {
			const price = v.prices.find((x) => x.currencyCode === cur);
			const stock = v.inventory?.stockedQuantity ?? 0;
			return {
				id: v.id,
				title: v.title,
				sku: v.sku,
				options: v.options,
				price: price ? { amount: price.amount, compareAtAmount: price.compareAtAmount, currencyCode: cur } : null,
				inStock: !v.manageInventory || v.allowBackorder || stock > 0,
			};
		}),
	};
}

// ---------- Categories & collections ----------

export async function listCategories(opts: { activeOnly?: boolean } = {}) {
	return db()
		.select()
		.from(productCategories)
		.where(opts.activeOnly ? eq(productCategories.isActive, true) : undefined)
		.orderBy(asc(productCategories.rank), asc(productCategories.name));
}

export async function createCategory(input: { name: string; handle?: string; description?: string | null; parentId?: string | null; isActive?: boolean }) {
	const id = newId("pcat");
	const handle = await uniqueHandle(db(), input.handle || input.name, productCategories);
	await db().insert(productCategories).values({
		id, name: input.name.trim(), handle, description: input.description ?? null,
		parentId: input.parentId || null, isActive: input.isActive ?? true,
	});
	await invalidate(CacheTags.catalog);
	return id;
}

export async function updateCategory(id: string, input: { name?: string; description?: string | null; parentId?: string | null; isActive?: boolean }) {
	if (input.parentId === id) throw invalid("A category cannot be its own parent");
	await db().update(productCategories).set({ ...input, parentId: input.parentId === undefined ? undefined : input.parentId || null }).where(eq(productCategories.id, id));
	await invalidate(CacheTags.catalog);
}

export async function deleteCategory(id: string) {
	await db().delete(productCategories).where(eq(productCategories.id, id));
	await invalidate(CacheTags.catalog);
}

export async function listCollections() {
	return db()
		.select({
			id: productCollections.id, title: productCollections.title, handle: productCollections.handle,
			description: productCollections.description,
			productCount: sql<number>`(select count(*)::int from ${products} where ${products.collectionId} = ${productCollections.id})`,
		})
		.from(productCollections)
		.orderBy(asc(productCollections.title));
}

export async function createCollection(input: { title: string; handle?: string; description?: string | null }) {
	const id = newId("pcol");
	const handle = await uniqueHandle(db(), input.handle || input.title, productCollections);
	await db().insert(productCollections).values({ id, title: input.title.trim(), handle, description: input.description ?? null });
	await invalidate(CacheTags.catalog);
	return id;
}

export async function deleteCollection(id: string) {
	await db().delete(productCollections).where(eq(productCollections.id, id));
	await invalidate(CacheTags.catalog);
}
