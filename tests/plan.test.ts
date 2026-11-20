import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { setupTestDb } from "./setup-db";
import type { Db } from "@/db";
import { products, user } from "@/db/schema";
import { allowedProviders, currentPlan, features, hasFeature, limits } from "@/lib/plan";
import { createProduct } from "@/workflows/catalog";
import * as cartFlows from "@/workflows/cart";
import { setStaffRole, updateStoreSettings } from "@/workflows/store";
import { createPromotion } from "@/modules/promotion/service";
import { getProduct } from "@/modules/product/service";
import { getSettingsUncached } from "@/modules/store/service";
import * as cartModule from "@/modules/cart/service";
import { auth } from "@/lib/auth";

let d: Db;
const setPlan = (p?: string) => (p ? (process.env.PLAN = p) : delete process.env.PLAN);

beforeAll(async () => {
	({ db: d } = await setupTestDb());
	process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
});
afterEach(() => {
	setPlan();
	delete process.env.REGION;
	delete process.env.ALLOWED_PAYMENT_PROVIDERS;
});

describe("tier table", () => {
	it("Starter < Standard < Advanced", () => {
		expect(features("starter")).toMatchObject({ customerAccounts: false, discounts: false, inventoryTracking: false, collections: false, apiKeys: false });
		expect(features("standard")).toMatchObject({ customerAccounts: true, discounts: true, inventoryTracking: true, collections: true, apiKeys: true, advancedPromotions: false, multiCurrency: false });
		expect(features("advanced")).toMatchObject({ advancedPromotions: true, multiCurrency: true, multiVendor: false });
		expect(hasFeature("multiVendor", "multivendor")).toBe(true);
		expect(limits("starter")).toEqual({ products: 50, staff: 1 });
		expect(limits("standard").staff).toBe(3);
	});

	it("defaults to Advanced outside production and ignores junk values", () => {
		expect(currentPlan()).toBe("advanced");
		setPlan("STARTER");
		expect(currentPlan()).toBe("starter");
		setPlan("platinum");
		expect(currentPlan()).toBe("advanced");
	});

	it("region decides payment providers unless overridden", () => {
		expect(allowedProviders()).toEqual(["paystack", "flutterwave"]);
		process.env.REGION = "international";
		expect(allowedProviders()).toEqual(["stripe"]);
		process.env.ALLOWED_PAYMENT_PROVIDERS = "paystack, Stripe";
		expect(allowedProviders()).toEqual(["paystack", "stripe"]);
	});
});

describe("Starter enforcement", () => {
	it("first settings row uses the region preset", async () => {
		const s = await getSettingsUncached();
		expect(s.defaultCurrency).toBe("NGN");
		expect(s.paymentProviders).toEqual(["paystack", "flutterwave"]);
	});

	it("caps products at 50 (existing products are kept)", async () => {
		setPlan("starter");
		await d.insert(products).values(Array.from({ length: 50 }, (_, i) => ({ id: `prod_cap_${i}`, title: `P${i}`, handle: `p-cap-${i}` })));
		await expect(createProduct({ title: "One too many", status: "draft" })).rejects.toThrow(/up to 50 products/);
		setPlan("standard");
		await expect(createProduct({ title: "Fine on Standard", status: "draft" })).resolves.toBeTruthy();
		await d.delete(products).where(like(products.id, "prod_cap_%"));
	});

	it("no discounts: codes are rejected and existing ones are ignored", async () => {
		setPlan("standard");
		const id = await createProduct({ title: "Tee", status: "published", variants: [{ title: "Default", prices: [{ currencyCode: "NGN", amount: 10000 }], stock: 5 }] });
		const variantId = (await getProduct(id))!.variants[0].id;
		await createPromotion({ code: "TEN", type: "percentage", value: 10 });
		const cart = await cartFlows.createCart({ currencyCode: "NGN" });
		await cartFlows.addLineItem(cart.id, variantId, 1);
		expect((await cartFlows.applyPromotion(cart.id, "TEN")).totals.discountTotal).toBe(1000);

		setPlan("starter");
		await expect(cartFlows.applyPromotion(cart.id, "TEN")).rejects.toThrow(/^Not found$/);
		const c = await cartFlows.retrieveCart(cart.id);
		expect(c.promotion).toBeNull();
		expect(c.totals.discountTotal).toBe(0);
		await cartModule.updateCart(cart.id, { promotionId: null });
	});

	it("no stock tracking: new items are always available", async () => {
		setPlan("starter");
		const id = await createProduct({ title: "Untracked", status: "published", variants: [{ title: "Default", prices: [{ currencyCode: "NGN", amount: 5000 }], stock: 0 }] });
		const variantId = (await getProduct(id))!.variants[0].id;
		const cart = await cartFlows.createCart({ currencyCode: "NGN" });
		await expect(cartFlows.addLineItem(cart.id, variantId, 3)).resolves.toBeTruthy();
	});

	it("staff limit", async () => {
		const now = new Date();
		await d.insert(user).values([
			{ id: "u_owner", name: "Owner", email: "owner@x.test", emailVerified: true, role: "admin", createdAt: now, updatedAt: now },
			{ id: "u_staff", name: "Staff", email: "staff@x.test", emailVerified: true, role: "customer", createdAt: now, updatedAt: now },
		]);
		setPlan("starter");
		await expect(setStaffRole("u_owner", "staff@x.test", "admin")).rejects.toThrow(/1 staff account/);
		setPlan("standard");
		await expect(setStaffRole("u_owner", "staff@x.test", "admin")).resolves.toBeUndefined();
	});

	it("customer sign-up is closed once an admin exists", async () => {
		setPlan("starter");
		await expect(auth().api.signUpEmail({ body: { name: "Buyer", email: "buyer@x.test", password: "Buyer-pass-123" } })).rejects.toThrow(/not available/);
		setPlan("standard");
		await expect(auth().api.signUpEmail({ body: { name: "Buyer", email: "buyer@x.test", password: "Buyer-pass-123" } })).resolves.toBeTruthy();
	});
});

describe("Settings rules", () => {
	it("one currency below Advanced; providers limited to the region", async () => {
		setPlan("standard");
		const s = await updateStoreSettings({ defaultCurrency: "NGN", currencies: ["NGN", "USD"] });
		expect(s.currencies).toEqual(["NGN"]);
		await expect(updateStoreSettings({ paymentProviders: ["stripe"] })).rejects.toThrow(/stripe is not available/);
		setPlan("advanced");
		expect((await updateStoreSettings({ defaultCurrency: "NGN", currencies: ["NGN", "USD"] })).currencies).toEqual(["NGN", "USD"]);
	});
});

describe("Hidden, not locked", () => {
	it("only available (in-plan, built) features are exposed", async () => {
		const { availableFeatures } = await import("@/lib/plan");
		const { visibleGuide } = await import("@/content/guide");
		expect(availableFeatures("starter")).toEqual([]);
		expect(availableFeatures("standard")).toEqual(["customerAccounts", "discounts", "inventoryTracking", "collections", "apiKeys"]);
		expect(availableFeatures("advanced")).toContain("multiCurrency");
		expect(availableFeatures("advanced")).not.toContain("reviews"); // not built yet → hidden
		const ids = visibleGuide((f) => availableFeatures("starter").includes(f), limits("starter")).flatMap((s) => s.entries.map((e) => e.id));
		expect(ids).not.toContain("discounts");
		expect(ids).not.toContain("inventory");
		expect(JSON.stringify(visibleGuide((f) => availableFeatures("starter").includes(f), limits("starter")))).not.toMatch(/Standard|Advanced|Starter|upgrade/i);
	});
});
