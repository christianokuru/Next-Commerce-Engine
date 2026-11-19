/** Catalog workflows: keep product (catalog) and inventory (stock) modules in sync atomically. */
import { transaction } from "@/db";
import * as product from "@/modules/product/service";
import * as inventory from "@/modules/inventory/service";
import { deleteImage } from "@/modules/media/service";

export type NewVariant = product.VariantInput & inventory.ItemSettings & { stock?: number };

export async function createProduct(input: Omit<product.ProductInput, "variants"> & { variants?: NewVariant[] }) {
	const variants = input.variants ?? [];
	return transaction(async (tx) => {
		const { id, variantIds } = await product.createProduct({ ...input, variants }, tx);
		await inventory.createItems(variantIds.map((variantId, i) => ({ variantId, ...variants[i] })), tx);
		return id;
	});
}

export async function addVariant(productId: string, v: NewVariant) {
	return transaction(async (tx) => {
		const variantId = await product.addVariant(productId, v, tx);
		await inventory.createItems([{ variantId, ...v }], tx);
		return variantId;
	});
}

export async function updateVariant(variantId: string, v: Partial<product.VariantInput> & inventory.ItemSettings & { stock?: number | null }, actorId?: string) {
	await transaction(async (tx) => {
		await product.updateVariant(variantId, v, tx);
		if (v.manageInventory !== undefined || v.allowBackorder !== undefined || v.lowStockThreshold !== undefined)
			await inventory.updateItemSettings(variantId, { manageInventory: v.manageInventory, allowBackorder: v.allowBackorder, lowStockThreshold: v.lowStockThreshold }, tx);
		if (v.stock !== undefined && v.stock !== null) await inventory.setStock(variantId, v.stock, actorId, tx);
	});
}

export async function deleteVariant(variantId: string) {
	await transaction(async (tx) => {
		await product.deleteVariant(variantId, tx);
		await inventory.deleteItems([variantId], tx);
	});
}

export async function deleteProduct(productId: string) {
	const { storageKeys } = await transaction(async (tx) => {
		const r = await product.deleteProduct(productId, tx);
		await inventory.deleteItems(r.variantIds, tx);
		return r;
	});
	await Promise.allSettled(storageKeys.map((k) => deleteImage(k))); // storage cleanup after commit
}

export async function deleteProductImage(imageId: string) {
	const img = await product.deleteProductImage(imageId);
	if (img?.storageKey) await deleteImage(img.storageKey).catch(() => {});
}
