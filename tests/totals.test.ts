import { describe, expect, it } from "vitest";
import { calculateTotals, type PromotionLike } from "@/modules/pricing/totals";

const promo = (p: Partial<PromotionLike>): PromotionLike => ({
	type: "percentage", value: 10, currencyCode: null, minSubtotal: null, usageLimit: null, usageCount: 0,
	startsAt: null, endsAt: null, isActive: true, ...p,
});
const base = { currency: "NGN", items: [{ unitPrice: 10000, quantity: 2 }], shipping: { amount: 1500, freeOverAmount: null }, promotion: null, taxRateBps: 0, taxInclusive: true };

describe("calculateTotals", () => {
	it("sums items and shipping", () => {
		const t = calculateTotals(base);
		expect(t).toMatchObject({ subtotal: 20000, shippingTotal: 1500, discountTotal: 0, total: 21500 });
	});
	it("applies percentage discount", () => {
		expect(calculateTotals({ ...base, promotion: promo({ value: 10 }) }).total).toBe(18000 + 1500);
	});
	it("caps fixed discount at subtotal and requires matching currency", () => {
		expect(calculateTotals({ ...base, promotion: promo({ type: "fixed", value: 999999, currencyCode: "NGN" }) }).total).toBe(1500);
		const wrong = calculateTotals({ ...base, promotion: promo({ type: "fixed", value: 500, currencyCode: "USD" }) });
		expect(wrong.discountTotal).toBe(0);
		expect(wrong.promotionError).toMatch(/currency/);
	});
	it("free shipping promo and free-over threshold", () => {
		expect(calculateTotals({ ...base, promotion: promo({ type: "free_shipping", value: 0 }) }).total).toBe(20000);
		expect(calculateTotals({ ...base, shipping: { amount: 1500, freeOverAmount: 20000 } }).shippingTotal).toBe(0);
	});
	it("exclusive tax is added; inclusive tax is extracted", () => {
		const ex = calculateTotals({ ...base, taxRateBps: 750, taxInclusive: false });
		expect(ex.taxTotal).toBe(1500);
		expect(ex.total).toBe(20000 + 1500 + 1500);
		const inc = calculateTotals({ ...base, taxRateBps: 750, taxInclusive: true });
		expect(inc.taxTotal).toBe(Math.round(20000 - 20000 / 1.075));
		expect(inc.total).toBe(21500);
	});
	it("rejects expired / exhausted / below-minimum promotions", () => {
		expect(calculateTotals({ ...base, promotion: promo({ endsAt: new Date(Date.now() - 1000) }) }).promotionError).toMatch(/expired/);
		expect(calculateTotals({ ...base, promotion: promo({ usageLimit: 1, usageCount: 1 }) }).promotionError).toMatch(/limit/);
		expect(calculateTotals({ ...base, promotion: promo({ minSubtotal: 50000 }) }).promotionError).toMatch(/minimum/);
	});
});
