"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/server/session";
import { f, formObject, toActionError, type ActionState } from "@/lib/action";
import { currency, email } from "@/lib/validators";
import { toMinor } from "@/lib/money";
import { CommerceError } from "@/lib/errors";
import { invalidate, CacheTags } from "@/lib/cache";
import * as products from "@/modules/product/service";
import * as inventory from "@/modules/inventory/service";
import * as orders from "@/modules/order/service";
import * as shipping from "@/modules/shipping/service";
import * as promos from "@/modules/promotion/service";
import * as authModule from "@/modules/auth/service";
import { updateSettings, getSettings } from "@/modules/store/service";
import { themeSchema } from "@/modules/store/theme";
import { PAYMENT_PROVIDERS } from "@/modules/payment/schema";
import * as catalog from "@/workflows/catalog";
import * as orderFlows from "@/workflows/order";

type Admin = Awaited<ReturnType<typeof assertAdmin>>;

/** Every admin mutation: authz check → validate → run → revalidate. */
async function run(fn: (admin: Admin) => Promise<string | void>, paths: string[] = []): Promise<ActionState> {
	try {
		const admin = await assertAdmin();
		const message = (await fn(admin)) ?? "Saved";
		await invalidate(CacheTags.catalog); // public Store API cache
		for (const p of paths) revalidatePath(p);
		return { ok: true, message };
	} catch (e) {
		return toActionError(e);
	}
}

const money = (cur: string) => z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount").transform((v) => toMinor(v, cur));
const optMoney = (cur: string) => z.string().trim().optional().transform((v) => (v ? money(cur).parse(v) : null));

// ---------- Products ----------

const productBase = z.object({
	title: f.text(200).min(1, "Title is required"),
	handle: f.optText(100),
	subtitle: f.optText(200),
	description: f.optText(10000),
	status: z.enum(["draft", "published", "archived"]),
	collectionId: f.optText(64),
});

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
	let id: string | undefined;
	const res = await run(async () => {
		const settings = await getSettings();
		const o = formObject(fd);
		const base = productBase.parse(o);
		const prices = settings.currencies
			.filter((c) => o[`price_${c}`]?.trim())
			.map((c) => ({ currencyCode: c, amount: money(c).parse(o[`price_${c}`]) }));
		if (!prices.length) throw new CommerceError("invalid_data", "Add a price in at least one currency");
		id = await catalog.createProduct({
			...base,
			handle: base.handle ?? undefined,
			categoryIds: fd.getAll("categoryIds").map(String).filter(Boolean),
			variants: [{ title: "Default", sku: f.optText(64).parse(o.sku), prices, stock: f.optInt.parse(o.stock) ?? 0 }],
		});
	}, ["/admin/products"]);
	if (res?.ok && id) redirect(`/admin/products/${id}`);
	return res;
}

export async function updateProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const id = z.string().parse(fd.get("id"));
		const base = productBase.parse(formObject(fd));
		await products.updateProduct(id, {
			...base,
			handle: base.handle ?? base.title,
			categoryIds: fd.getAll("categoryIds").map(String).filter(Boolean),
		});
	}, ["/admin/products"]);
}

export async function deleteProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
	const res = await run(async () => {
		await catalog.deleteProduct(z.string().parse(fd.get("id")));
	}, ["/admin/products"]);
	if (res?.ok) redirect("/admin/products");
	return res;
}

export async function setOptionsAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const id = z.string().parse(fd.get("productId"));
		const lines = String(fd.get("options") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
		const options = lines.map((l) => {
			const [title, values = ""] = l.split(":");
			return { title: title.trim(), values: values.split(",").map((v) => v.trim()).filter(Boolean) };
		}).filter((o) => o.title && o.values.length);
		await products.setProductOptions(id, options);
		return "Options updated";
	}, ["/admin/products"]);
}

async function variantPrices(o: Record<string, string>) {
	const settings = await getSettings();
	return settings.currencies
		.filter((c) => o[`price_${c}`]?.trim())
		.map((c) => ({ currencyCode: c, amount: money(c).parse(o[`price_${c}`]), compareAtAmount: optMoney(c).parse(o[`compare_${c}`]) }));
}

export async function addVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const o = formObject(fd);
		const productId = z.string().parse(o.productId);
		const options: Record<string, string> = {};
		for (const [k, v] of Object.entries(o)) if (k.startsWith("opt_") && v.trim()) options[k.slice(4)] = v.trim();
		await catalog.addVariant(productId, {
			title: f.optText(200).parse(o.title) ?? undefined,
			sku: f.optText(64).parse(o.sku),
			options,
			prices: await variantPrices(o),
			stock: f.optInt.parse(o.stock) ?? 0,
			manageInventory: f.bool.parse(o.manageInventory),
			allowBackorder: f.bool.parse(o.allowBackorder),
		});
		return "Variant added";
	}, ["/admin/products"]);
}

export async function updateVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async (admin) => {
		const o = formObject(fd);
		await catalog.updateVariant(z.string().parse(o.variantId), {
			title: f.text(200).min(1).parse(o.title),
			sku: f.optText(64).parse(o.sku),
			prices: await variantPrices(o),
			manageInventory: f.bool.parse(o.manageInventory),
			allowBackorder: f.bool.parse(o.allowBackorder),
			stock: f.optInt.parse(o.stock),
		}, admin.id);
		return "Variant saved";
	}, ["/admin/products", "/admin/inventory"]);
}

export async function deleteVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await catalog.deleteVariant(z.string().parse(fd.get("variantId"))); return "Variant deleted"; }, ["/admin/products"]);
}

export async function addImageAction(input: { productId: string; url: string; key: string }): Promise<ActionState> {
	return run(async () => {
		const p = z.object({ productId: z.string(), url: z.string().startsWith("/media/products/"), key: z.string().startsWith("products/") }).parse(input);
		await products.addProductImage(p.productId, { url: p.url, storageKey: p.key });
		return "Image added";
	}, ["/admin/products"]);
}

export async function deleteImageAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		await catalog.deleteProductImage(z.string().parse(fd.get("imageId")));
		return "Image removed";
	}, ["/admin/products"]);
}

export async function setThumbnailAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		await products.updateProduct(z.string().parse(fd.get("productId")), { thumbnail: z.string().parse(fd.get("url")) });
		return "Thumbnail updated";
	}, ["/admin/products"]);
}

// ---------- Categories & collections ----------

export async function createCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const o = z.object({ name: f.text(100).min(1), description: f.optText(1000), parentId: f.optText(64) }).parse(formObject(fd));
		await products.createCategory(o);
		return "Category created";
	}, ["/admin/categories"]);
}

export async function toggleCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		await products.updateCategory(z.string().parse(fd.get("id")), { isActive: fd.get("isActive") === "true" });
	}, ["/admin/categories"]);
}

export async function deleteCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await products.deleteCategory(z.string().parse(fd.get("id"))); return "Category deleted"; }, ["/admin/categories"]);
}

export async function createCollectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const o = z.object({ title: f.text(100).min(1), description: f.optText(1000) }).parse(formObject(fd));
		await products.createCollection(o);
		return "Collection created";
	}, ["/admin/collections"]);
}

export async function deleteCollectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await products.deleteCollection(z.string().parse(fd.get("id"))); return "Collection deleted"; }, ["/admin/collections"]);
}

// ---------- Inventory ----------

export async function adjustStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async (admin) => {
		const o = z.object({ variantId: z.string(), mode: z.enum(["set", "add"]), quantity: f.int, note: f.optText(200) }).parse(formObject(fd));
		if (o.mode === "set") await inventory.setStock(o.variantId, o.quantity, admin.id);
		else await inventory.adjustStock(o.variantId, o.quantity, { reason: "restock", actorId: admin.id, note: o.note ?? undefined });
		return "Stock updated";
	}, ["/admin/inventory", "/admin/products"]);
}

// ---------- Orders ----------

export async function fulfillmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async (admin) => {
		const o = z.object({
			orderId: z.string(), status: z.enum(["not_fulfilled", "fulfilled", "shipped", "delivered"]),
			trackingNumber: f.optText(100), carrier: f.optText(100),
		}).parse(formObject(fd));
		await orderFlows.fulfillOrder(o.orderId, o, admin.id);
		return "Fulfillment updated";
	}, ["/admin/orders"]);
}

export async function cancelOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async (admin) => {
		await orderFlows.cancelOrder(z.string().parse(fd.get("orderId")), admin.id, { restock: fd.get("restock") === "on" });
		return "Order canceled";
	}, ["/admin/orders"]);
}

export async function refundAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async (admin) => {
		const o = z.object({ orderId: z.string(), currency, amount: z.string(), reason: f.optText(300) }).parse(formObject(fd));
		const amount = money(o.currency).parse(o.amount);
		await orderFlows.refundOrder(o.orderId, amount, { reason: o.reason ?? undefined, actorId: admin.id });
		return "Refund issued";
	}, ["/admin/orders"]);
}

export async function orderNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async (admin) => {
		const o = z.object({ orderId: z.string(), note: f.text(2000).min(1) }).parse(formObject(fd));
		await orders.addOrderNote(o.orderId, o.note, admin.id);
		return "Note added";
	}, ["/admin/orders"]);
}

// ---------- Promotions ----------

export async function createPromotionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const o = formObject(fd);
		const type = z.enum(["percentage", "fixed", "free_shipping"]).parse(o.type);
		const cur = o.currencyCode ? currency.parse(o.currencyCode) : null;
		const date = z.string().optional().transform((v) => (v ? new Date(v) : null));
		await promos.createPromotion({
			code: z.string().parse(o.code),
			description: f.optText(300).parse(o.description),
			type,
			value: type === "percentage" ? f.int.parse(o.value) : type === "fixed" ? money(cur ?? "NGN").parse(o.value) : 0,
			currencyCode: type === "fixed" ? cur : null,
			minSubtotal: o.minSubtotal ? money(cur ?? "NGN").parse(o.minSubtotal) : null,
			usageLimit: f.optInt.parse(o.usageLimit),
			startsAt: date.parse(o.startsAt),
			endsAt: date.parse(o.endsAt),
		});
		return "Promotion created";
	}, ["/admin/promotions"]);
}

export async function togglePromotionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await promos.setPromotionActive(z.string().parse(fd.get("id")), fd.get("isActive") === "true"); }, ["/admin/promotions"]);
}

export async function deletePromotionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await promos.deletePromotion(z.string().parse(fd.get("id"))); return "Promotion deleted"; }, ["/admin/promotions"]);
}

// ---------- Shipping ----------

export async function createZoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const o = z.object({ name: f.text(100).min(1), countries: f.text(1000) }).parse(formObject(fd));
		await shipping.createZone({ name: o.name, countries: o.countries.split(/[\s,]+/) });
		return "Zone created";
	}, ["/admin/shipping"]);
}

export async function deleteZoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await shipping.deleteZone(z.string().parse(fd.get("id"))); return "Zone deleted"; }, ["/admin/shipping"]);
}

export async function createShippingOptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const o = formObject(fd);
		const cur = currency.parse(o.currencyCode);
		await shipping.createOption({
			zoneId: z.string().parse(o.zoneId),
			name: f.text(100).min(1).parse(o.name),
			currencyCode: cur,
			amount: money(cur).parse(o.amount),
			freeOverAmount: optMoney(cur).parse(o.freeOverAmount),
			minDeliveryDays: f.optInt.parse(o.minDeliveryDays),
			maxDeliveryDays: f.optInt.parse(o.maxDeliveryDays),
		});
		return "Shipping option created";
	}, ["/admin/shipping"]);
}

export async function toggleShippingOptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await shipping.setOptionActive(z.string().parse(fd.get("id")), fd.get("isActive") === "true"); }, ["/admin/shipping"]);
}

export async function deleteShippingOptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await shipping.deleteOption(z.string().parse(fd.get("id"))); return "Option deleted"; }, ["/admin/shipping"]);
}

// ---------- Settings & team ----------

export async function updateSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => {
		const o = formObject(fd);
		const currencies = z.array(currency).min(1).parse(String(o.currencies ?? "").split(/[\s,]+/).filter(Boolean));
		const defaultCurrency = currency.parse(o.defaultCurrency);
		if (!currencies.includes(defaultCurrency)) currencies.unshift(defaultCurrency);
		const rate = z.coerce.number().min(0).max(100).parse(o.taxRate || "0");
		await updateSettings({
			name: f.text(100).min(1).parse(o.name),
			supportEmail: o.supportEmail ? email.parse(o.supportEmail) : null,
			storefrontUrl: o.storefrontUrl ? z.url().max(300).parse(o.storefrontUrl) : null,
			logoUrl: o.logoUrl ? z.url().max(500).parse(o.logoUrl) : null,
			defaultCurrency,
			currencies,
			taxRateBps: Math.round(rate * 100),
			taxInclusive: f.bool.parse(o.taxInclusive),
			paymentProviders: PAYMENT_PROVIDERS.filter((p) => fd.get(`provider_${p}`) === "on"),
		});
		return "Settings saved";
	}, ["/admin/settings"]);
}

export async function setAdminRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async (admin) => {
		const o = z.object({ email, role: z.enum(["admin", "customer"]) }).parse(formObject(fd));
		await authModule.setRole(admin.id, o.email, o.role);
		return o.role === "admin" ? `${o.email} is now an admin` : `${o.email} is no longer an admin`;
	}, ["/admin/settings"]);
}

// ---------- Appearance ----------

export async function saveThemeAction(theme: unknown): Promise<ActionState> {
	return run(async () => {
		await updateSettings({ theme: themeSchema.parse(theme) });
		return "Appearance saved";
	}, ["/admin", "/account"]);
}

// ---------- API keys ----------

export async function createApiKeyAction(_: ActionState, fd: FormData): Promise<ActionState> {
	try {
		const admin = await assertAdmin();
		const name = f.text(80).min(1, "Name is required").parse(fd.get("name") ?? "");
		const { key } = await authModule.createApiKey(name, admin.id);
		revalidatePath("/admin/settings");
		return { ok: true, message: "API key created — copy it now, it won't be shown again", data: { key } };
	} catch (e) {
		return toActionError(e);
	}
}

export async function revokeApiKeyAction(_: ActionState, fd: FormData): Promise<ActionState> {
	return run(async () => { await authModule.revokeApiKey(z.string().parse(fd.get("id"))); return "API key revoked"; }, ["/admin/settings"]);
}
