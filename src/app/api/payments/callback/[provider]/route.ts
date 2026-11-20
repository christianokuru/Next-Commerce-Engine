import { NextResponse } from "next/server";
import { PAYMENT_PROVIDERS, type PaymentProviderId } from "@/modules/payment/schema";
import { confirmPayment } from "@/workflows/checkout";
import { getSettings } from "@/modules/store/service";
import { appUrl } from "@/lib/env";
import { getByReference } from "@/modules/payment/service";

/**
 * Shopper lands here after the hosted payment page. Query params are only a hint:
 * the payment is re-verified server-to-server before any order is created.
 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
	const { provider } = await ctx.params;
	const reference = new URL(req.url).searchParams.get("reference") ?? "";
	const settings = await getSettings();
	const valid = PAYMENT_PROVIDERS.includes(provider as PaymentProviderId) && /^nce_[\w-]{10,64}$/.test(reference);
	// Where to send the shopper: the returnUrl their storefront gave when starting payment (validated then),
	// else Settings → Storefront URL + /checkout/complete, else the engine's own result page.
	const p = valid ? await getByReference(provider as PaymentProviderId, reference).catch(() => null) : null;
	const returnUrl = typeof p?.data?.returnUrl === "string" ? p.data.returnUrl : null;
	const base = settings.storefrontUrl?.replace(/\/$/, "");
	const dest = (status: string, extra: Record<string, string> = {}) => {
		const qs = new URLSearchParams({ status, ...extra }).toString();
		const target = returnUrl ?? (base ? `${base}/checkout/complete` : `${appUrl()}/checkout/result`);
		return NextResponse.redirect(`${target}${target.includes("?") ? "&" : "?"}${qs}`, 303);
	};
	if (!valid) return dest("invalid");
	try {
		const r = await confirmPayment(provider as PaymentProviderId, reference);
		if (r.status === "succeeded") return dest("succeeded", { order: r.order.id, number: String(r.order.displayId) });
		return dest(r.status, { reference });
	} catch (e) {
		console.error("payment callback error", e);
		return dest("error", { reference });
	}
}
