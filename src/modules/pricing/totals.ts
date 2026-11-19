/**
 * Pure totals calculation. All values are integer minor units.
 * Kept side-effect free so carts, checkout and order creation share one source of truth.
 */
export type PromotionLike = {
	type: "percentage" | "fixed" | "free_shipping";
	value: number;
	currencyCode: string | null;
	minSubtotal: number | null;
	usageLimit: number | null;
	usageCount: number;
	startsAt: Date | null;
	endsAt: Date | null;
	isActive: boolean;
};

export type TotalsInput = {
	currency: string;
	items: { unitPrice: number; quantity: number }[];
	shipping: { amount: number; freeOverAmount: number | null } | null;
	promotion: PromotionLike | null;
	taxRateBps: number;
	taxInclusive: boolean;
};

export type Totals = {
	subtotal: number;
	itemDiscount: number;
	shippingDiscount: number;
	discountTotal: number;
	shippingTotal: number;
	taxTotal: number;
	total: number;
	promotionError: string | null;
};

export function promotionError(
	p: PromotionLike,
	ctx: { subtotal: number; currency: string; now?: Date },
): string | null {
	const now = ctx.now ?? new Date();
	if (!p.isActive) return "Promotion is not active";
	if (p.startsAt && p.startsAt > now) return "Promotion has not started";
	if (p.endsAt && p.endsAt < now) return "Promotion has expired";
	if (p.usageLimit !== null && p.usageCount >= p.usageLimit) return "Promotion usage limit reached";
	if (p.type === "fixed" && p.currencyCode?.toUpperCase() !== ctx.currency.toUpperCase())
		return "Promotion is not valid for this currency";
	if (p.minSubtotal !== null && ctx.subtotal < p.minSubtotal) return "Cart subtotal is below the promotion minimum";
	return null;
}

export function calculateTotals(input: TotalsInput): Totals {
	const subtotal = input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

	let shippingTotal = 0;
	if (input.shipping) {
		const free = input.shipping.freeOverAmount !== null && subtotal >= input.shipping.freeOverAmount;
		shippingTotal = free ? 0 : input.shipping.amount;
	}

	let itemDiscount = 0;
	let shippingDiscount = 0;
	let promoErr: string | null = null;
	if (input.promotion) {
		promoErr = promotionError(input.promotion, { subtotal, currency: input.currency });
		if (!promoErr) {
			const p = input.promotion;
			if (p.type === "percentage") itemDiscount = Math.floor((subtotal * Math.min(Math.max(p.value, 0), 100)) / 100);
			else if (p.type === "fixed") itemDiscount = Math.min(Math.max(p.value, 0), subtotal);
			else if (p.type === "free_shipping") shippingDiscount = shippingTotal;
		}
	}

	const taxableBase = subtotal - itemDiscount;
	const bps = Math.max(input.taxRateBps, 0);
	let taxTotal: number;
	let total: number;
	if (input.taxInclusive) {
		taxTotal = bps === 0 ? 0 : Math.round(taxableBase - (taxableBase * 10000) / (10000 + bps));
		total = taxableBase + shippingTotal - shippingDiscount;
	} else {
		taxTotal = Math.round((taxableBase * bps) / 10000);
		total = taxableBase + shippingTotal - shippingDiscount + taxTotal;
	}

	return {
		subtotal,
		itemDiscount,
		shippingDiscount,
		discountTotal: itemDiscount + shippingDiscount,
		shippingTotal,
		taxTotal,
		total,
		promotionError: promoErr,
	};
}
