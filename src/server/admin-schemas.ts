/** JSON input schemas for the Admin API. Money is in minor units (kobo/cents). */
import { z } from "zod";
import { currency, minorAmount } from "@/lib/validators";
import { themeSchema } from "@/modules/store/theme";
import { PAYMENT_PROVIDERS } from "@/modules/payment/schema";

const price = z.object({ currencyCode: currency, amount: minorAmount, compareAtAmount: minorAmount.nullish() });
const stockFlags = { manageInventory: z.boolean().optional(), allowBackorder: z.boolean().optional(), lowStockThreshold: z.number().int().min(0).nullish() };

export const variantCreate = z.object({
	title: z.string().trim().max(200).optional(), sku: z.string().trim().max(64).nullish(), options: z.record(z.string(), z.string().max(100)).optional(),
	prices: z.array(price).max(20), stock: z.number().int().min(0).max(1_000_000).optional(), weightGrams: z.number().int().min(0).nullish(), ...stockFlags,
});
export const variantUpdate = variantCreate.partial().extend({ stock: z.number().int().min(0).max(1_000_000).nullish() });

const productFields = {
	title: z.string().trim().min(1).max(200), handle: z.string().trim().max(100).optional(), subtitle: z.string().trim().max(200).nullish(),
	description: z.string().max(10000).nullish(), status: z.enum(["draft", "published", "archived"]).optional(), thumbnail: z.string().max(500).nullish(),
	collectionId: z.string().max(64).nullish(), categoryIds: z.array(z.string().max(64)).max(50).optional(),
};
export const productCreate = z.object({
	...productFields,
	options: z.array(z.object({ title: z.string().trim().min(1).max(50), values: z.array(z.string().trim().min(1).max(50)).min(1).max(50) })).max(5).optional(),
	variants: z.array(variantCreate).max(100).optional(),
});
export const productUpdate = z.object(productFields).partial();
export const optionsPut = z.object({ options: productCreate.shape.options.unwrap() });

export const categoryCreate = z.object({ name: z.string().trim().min(1).max(100), handle: z.string().max(100).optional(), description: z.string().max(1000).nullish(), parentId: z.string().max(64).nullish(), isActive: z.boolean().optional() });
export const categoryUpdate = categoryCreate.omit({ handle: true }).partial();
export const collectionCreate = z.object({ title: z.string().trim().min(1).max(100), handle: z.string().max(100).optional(), description: z.string().max(1000).nullish() });
export const collectionUpdate = collectionCreate.omit({ handle: true }).partial();

export const stockChange = z.object({ mode: z.enum(["set", "adjust"]), quantity: z.number().int().min(-1_000_000).max(1_000_000), note: z.string().max(200).optional() });

export const fulfillment = z.object({ status: z.enum(["not_fulfilled", "fulfilled", "shipped", "delivered"]), trackingNumber: z.string().max(100).nullish(), carrier: z.string().max(100).nullish() });
export const cancel = z.object({ restock: z.boolean().default(true) });
export const refund = z.object({ amount: z.number().int().positive(), reason: z.string().max(300).optional() });
export const note = z.object({ note: z.string().trim().min(1).max(2000) });

export const promotionCreate = z.object({
	code: z.string(), description: z.string().max(300).nullish(), type: z.enum(["percentage", "fixed", "free_shipping"]), value: z.number().int().min(0),
	currencyCode: currency.nullish(), minSubtotal: minorAmount.nullish(), usageLimit: z.number().int().positive().nullish(),
	startsAt: z.coerce.date().nullish(), endsAt: z.coerce.date().nullish(), isActive: z.boolean().optional(),
});
export const toggle = z.object({ isActive: z.boolean() });

export const zoneCreate = z.object({ name: z.string().trim().min(1).max(100), countries: z.array(z.string().length(2)).min(1).max(250) });
export const shippingOptionCreate = z.object({
	name: z.string().trim().min(1).max(100), currencyCode: currency, amount: minorAmount, freeOverAmount: minorAmount.nullish(),
	minDeliveryDays: z.number().int().min(0).nullish(), maxDeliveryDays: z.number().int().min(0).nullish(),
});

export const settingsUpdate = z.object({
	name: z.string().trim().min(1).max(100), supportEmail: z.email().nullish(), storefrontUrl: z.url().max(300).nullish(), logoUrl: z.url().max(500).nullish(),
	defaultCurrency: currency, currencies: z.array(currency).min(1).max(20), taxRateBps: z.number().int().min(0).max(10000), taxInclusive: z.boolean(),
	paymentProviders: z.array(z.enum(PAYMENT_PROVIDERS)), theme: themeSchema,
}).partial();
