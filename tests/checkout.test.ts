import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "./setup-db";
import type { Db } from "@/db";
import { inventoryItems, orders, payments, promotions, webhookEvents, carts } from "@/db/schema";
import { updateSettings } from "@/modules/store/service";
import { getProduct } from "@/modules/product/service";
import { createProduct } from "@/workflows/catalog";
import { createZone, createOption } from "@/modules/shipping/service";
import { createPromotion } from "@/modules/promotion/service";
import * as cartSvc from "@/workflows/cart";
import { initiatePayment, confirmPayment, handleWebhook } from "@/workflows/checkout";
import { refundOrder, cancelOrder } from "@/workflows/order";
import { registerProvider } from "@/modules/payment/providers";
import type { PaymentProvider, VerifyResult } from "@/modules/payment/providers/types";

let d: Db;

// Fake provider replacing Paystack's network calls; behaviour is controlled per test.
const fake = {
	verify: async (): Promise<VerifyResult> => ({ status: "succeeded", amount: null, currency: null, providerReference: "ps_1" }),
	paidAmount: null as number | null,
	paidCurrency: "NGN",
	refunds: [] as number[],
};
const fakePaystack: PaymentProvider = {
	id: "paystack", label: "Paystack (fake)", currencies: ["NGN"],
	isConfigured: () => true,
	initialize: async (i) => ({ redirectUrl: `https://checkout.test/${i.reference}`, providerReference: i.reference }),
	verify: async (p) => {
		const r = await fake.verify();
		return { ...r, amount: r.amount ?? fake.paidAmount, currency: r.currency ?? fake.paidCurrency, providerReference: p.reference };
	},
	parseWebhook: async (raw) => {
		const b = JSON.parse(raw);
		if (b.sig !== "ok") throw new Error("bad sig");
		return { eventId: b.id, type: "charge.success", reference: b.reference };
	},
	refund: async ({ amount }) => { fake.refunds.push(amount); return { id: `rf_${fake.refunds.length}`, status: "succeeded" }; },
};

const addr = { firstName: "Ada", lastName: "Obi", address1: "1 Marina", city: "Lagos", countryCode: "NG", phone: "+2348000000000" };

async function product(stock: number, price = 10000, opts: { backorder?: boolean } = {}) {
	const id = await createProduct({
		title: `Tee ${Math.random()}`, status: "published",
		variants: [{ title: "Default", prices: [{ currencyCode: "NGN", amount: price }], stock, allowBackorder: opts.backorder }],
	});
	const p = await getProduct(id);
	return p!.variants[0].id;
}

async function readyCart(variantId: string, qty: number, shippingOptionId: string) {
	const cart = await cartSvc.createCart({ currencyCode: "NGN" });
	await cartSvc.addLineItem(cart.id, variantId, qty);
	await cartSvc.updateCart(cart.id, { email: "ada@example.com", shippingAddress: addr });
	await cartSvc.setShippingOption(cart.id, shippingOptionId);
	return cart.id;
}

const stockOf = async (variantId: string) =>
	(await d.select().from(inventoryItems).where(eq(inventoryItems.variantId, variantId)))[0].stockedQuantity;

let shippingOptionId: string;

beforeAll(async () => {
	({ db: d } = await setupTestDb());
	registerProvider(fakePaystack);
	await updateSettings({ currencies: ["NGN", "USD"], defaultCurrency: "NGN", paymentProviders: ["paystack"], taxRateBps: 750, taxInclusive: true });
	const zone = await createZone({ name: "Nigeria", countries: ["ng"] });
	shippingOptionId = await createOption({ zoneId: zone, name: "Standard", currencyCode: "NGN", amount: 2000 });
});

beforeEach(() => {
	fake.verify = async () => ({ status: "succeeded", amount: null, currency: null, providerReference: null });
	fake.paidCurrency = "NGN";
});

describe("cart", () => {
	it("enforces stock, currency and checkout readiness", async () => {
		const v = await product(2);
		const cart = await cartSvc.createCart({});
		await expect(cartSvc.addLineItem(cart.id, v, 3)).rejects.toThrow(/stock/);
		await cartSvc.addLineItem(cart.id, v, 2);
		await expect(cartSvc.createCart({ currencyCode: "EUR" })).rejects.toThrow(/not supported/);
		await expect(initiatePayment(cart.id, "paystack")).rejects.toThrow(/Email/);
		await cartSvc.updateCart(cart.id, { email: "x@y.com", shippingAddress: addr });
		await expect(initiatePayment(cart.id, "paystack")).rejects.toThrow(/shipping method/);
	});

	it("rejects unknown/invalid promotions and applies valid ones", async () => {
		await createPromotion({ code: "save10", type: "percentage", value: 10 });
		await createPromotion({ code: "OLD", type: "percentage", value: 10, endsAt: new Date(Date.now() - 1000) });
		const v = await product(10);
		const id = await readyCart(v, 1, shippingOptionId);
		await expect(cartSvc.applyPromotion(id, "NOPE")).rejects.toThrow(/Invalid/);
		await expect(cartSvc.applyPromotion(id, "old")).rejects.toThrow(/expired/);
		const c = await cartSvc.applyPromotion(id, "Save10");
		expect(c.totals).toMatchObject({ subtotal: 10000, discountTotal: 1000, shippingTotal: 2000, total: 11000 });
	});
});

describe("checkout → order", () => {
	it("creates exactly one order, decrements stock and counts promo usage (idempotent)", async () => {
		const v = await product(5);
		const id = await readyCart(v, 2, shippingOptionId);
		await cartSvc.applyPromotion(id, "SAVE10");
		const cart = await cartSvc.retrieveCart(id);
		expect(cart.totals.total).toBe(20000 - 2000 + 2000);

		const p1 = await initiatePayment(id, "paystack");
		const p2 = await initiatePayment(id, "paystack");
		expect(p2.paymentId).toBe(p1.paymentId); // pending session reused

		fake.paidAmount = cart.totals.total;
		const results = await Promise.all([1, 2, 3, 4].map(() => confirmPayment("paystack", p1.reference)));
		const orderIds = new Set(results.map((r) => (r.status === "succeeded" ? r.order.id : null)));
		expect(orderIds.size).toBe(1);
		expect([...orderIds][0]).toBeTruthy();

		const all = await d.select().from(orders).where(eq(orders.cartId, id));
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ total: 20000, discountTotal: 2000, status: "pending", paymentStatus: "captured" });
		expect(await stockOf(v)).toBe(3);
		const [promo] = await d.select().from(promotions).where(eq(promotions.code, "SAVE10"));
		expect(promo.usageCount).toBe(1);
		const [pay] = await d.select().from(payments).where(eq(payments.id, p1.paymentId));
		expect(pay).toMatchObject({ status: "captured", orderId: all[0].id });
		await expect(cartSvc.addLineItem(id, v, 1)).rejects.toThrow(/completed/);
	});

	it("flags (never fulfils) a payment whose captured amount differs", async () => {
		const v = await product(5);
		const id = await readyCart(v, 1, shippingOptionId);
		const p = await initiatePayment(id, "paystack");
		fake.paidAmount = 100; // attacker-tampered / partial amount
		const r = await confirmPayment("paystack", p.reference);
		expect(r.status).toBe("requires_action");
		expect(await d.select().from(orders).where(eq(orders.cartId, id))).toHaveLength(0);
		expect(await stockOf(v)).toBe(5);
	});

	it("flags payment when cart changed after payment started", async () => {
		const v = await product(5);
		const id = await readyCart(v, 1, shippingOptionId);
		const p = await initiatePayment(id, "paystack");
		const before = (await cartSvc.retrieveCart(id)).totals.total;
		await cartSvc.addLineItem(id, v, 1);
		fake.paidAmount = before;
		expect((await confirmPayment("paystack", p.reference)).status).toBe("requires_action");
		expect(await d.select().from(orders).where(eq(orders.cartId, id))).toHaveLength(0);
	});

	it("marks failed payments without creating orders", async () => {
		const v = await product(5);
		const id = await readyCart(v, 1, shippingOptionId);
		const p = await initiatePayment(id, "paystack");
		fake.verify = async () => ({ status: "failed", amount: null, currency: null, providerReference: null });
		expect((await confirmPayment("paystack", p.reference)).status).toBe("failed");
		const [pay] = await d.select().from(payments).where(eq(payments.id, p.paymentId));
		expect(pay.status).toBe("failed");
	});

	it("never oversells: last unit bought twice → second order requires action", async () => {
		const v = await product(1);
		const a = await readyCart(v, 1, shippingOptionId);
		const b = await readyCart(v, 1, shippingOptionId);
		const pa = await initiatePayment(a, "paystack");
		const pb = await initiatePayment(b, "paystack");
		fake.paidAmount = (await cartSvc.retrieveCart(a)).totals.total;
		const [ra, rb] = await Promise.all([confirmPayment("paystack", pa.reference), confirmPayment("paystack", pb.reference)]);
		const statuses = [ra, rb].map((r) => (r.status === "succeeded" ? r.order.status : r.status)).sort();
		expect(statuses).toEqual(["pending", "requires_action"]);
		expect(await stockOf(v)).toBe(0);
	});

	it("cancel restocks; refunds update payment + order status", async () => {
		const v = await product(4);
		const id = await readyCart(v, 2, shippingOptionId);
		const p = await initiatePayment(id, "paystack");
		fake.paidAmount = (await cartSvc.retrieveCart(id)).totals.total;
		const r = await confirmPayment("paystack", p.reference);
		if (r.status !== "succeeded") throw new Error("expected success");
		expect(await stockOf(v)).toBe(2);

		await refundOrder(r.order.id, 5000);
		let [o] = await d.select().from(orders).where(eq(orders.id, r.order.id));
		expect(o).toMatchObject({ paymentStatus: "partially_refunded", refundedTotal: 5000 });
		await expect(refundOrder(r.order.id, o.total)).rejects.toThrow(/exceeds/);
		await refundOrder(r.order.id, o.total - 5000);
		[o] = await d.select().from(orders).where(eq(orders.id, r.order.id));
		expect(o.paymentStatus).toBe("refunded");

		await cancelOrder(r.order.id);
		expect(await stockOf(v)).toBe(4);
	});
});

describe("webhooks", () => {
	it("verifies signature, de-duplicates events and completes the order", async () => {
		const v = await product(3);
		const id = await readyCart(v, 1, shippingOptionId);
		const p = await initiatePayment(id, "paystack");
		fake.paidAmount = (await cartSvc.retrieveCart(id)).totals.total;
		await expect(handleWebhook("paystack", JSON.stringify({ sig: "bad", id: "e1", reference: p.reference }), new Headers())).rejects.toThrow();
		const body = JSON.stringify({ sig: "ok", id: "evt_1", reference: p.reference });
		const r1 = await handleWebhook("paystack", body, new Headers());
		expect(r1).toMatchObject({ status: "succeeded" });
		const r2 = await handleWebhook("paystack", body, new Headers());
		expect(r2).toMatchObject({ duplicate: true });
		expect(await d.select().from(webhookEvents).where(eq(webhookEvents.eventId, "evt_1"))).toHaveLength(1);
		const [cart] = await d.select().from(carts).where(eq(carts.id, id));
		expect(cart.completedAt).toBeTruthy();
	});
});
