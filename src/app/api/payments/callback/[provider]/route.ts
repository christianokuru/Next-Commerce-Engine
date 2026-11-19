import { NextResponse } from "next/server";
import { PAYMENT_PROVIDERS, type PaymentProviderId } from "@/modules/payment/schema";
import { confirmPayment } from "@/workflows/checkout";
import { getSettings } from "@/modules/store/service";
import { appUrl } from "@/lib/env";

/**
 * Shopper lands here after the hosted payment page. Query params are only a hint:
 * the payment is re-verified server-to-server before any order is created.
 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
	const { provider } = await ctx.params;
	const reference = new URL(req.url).searchParams.get("reference") ?? "";
	const settings = await getSettings();
	const base = settings.storefrontUrl?.replace(/\/$/, "");
	const dest = (status: string, extra: Record<string, string> = {}) => {
		const qs = new URLSearchParams({ status, ...extra }).toString();
		return NextResponse.redirect(base ? `${base}/checkout/complete?${qs}` : `${appUrl()}/checkout/result?${qs}`, 303);
	};
	if (!PAYMENT_PROVIDERS.includes(provider as PaymentProviderId) || !/^nce_[\w-]{10,64}$/.test(reference)) return dest("invalid");
	try {
		const r = await confirmPayment(provider as PaymentProviderId, reference);
		if (r.status === "succeeded") return dest("succeeded", { order: r.order.id, number: String(r.order.displayId) });
		return dest(r.status, { reference });
	} catch (e) {
		console.error("payment callback error", e);
		return dest("error", { reference });
	}
}
