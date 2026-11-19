import { env } from "@/lib/env";
import { hmac, safeEqual, toHex } from "@/lib/crypto";
import { providerFetch, ProviderError, type PaymentProvider } from "./types";

const API = "https://api.paystack.co";
const key = () => env("PAYSTACK_SECRET_KEY") ?? "";
const headers = () => ({ Authorization: `Bearer ${key()}`, "Content-Type": "application/json" });

type PsResponse<T> = { status: boolean; message: string; data: T };

export const paystack: PaymentProvider = {
	id: "paystack",
	label: "Paystack",
	currencies: ["NGN", "GHS", "ZAR", "KES", "USD", "XOF", "EGP"],
	isConfigured: () => Boolean(env("PAYSTACK_SECRET_KEY")),

	async initialize(i) {
		const r = await providerFetch<PsResponse<{ authorization_url: string; reference: string }>>("paystack", `${API}/transaction/initialize`, {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				email: i.email,
				amount: i.amount, // Paystack expects the subunit (kobo/pesewas/cents)
				currency: i.currency,
				reference: i.reference,
				callback_url: i.callbackUrl,
				metadata: { ...i.metadata, cancel_action: i.cancelUrl },
			}),
		});
		if (!r.status) throw new ProviderError("paystack", r.message);
		return { redirectUrl: r.data.authorization_url, providerReference: r.data.reference };
	},

	async verify({ reference }) {
		const r = await providerFetch<PsResponse<{ id: number; status: string; amount: number; currency: string; reference: string }>>(
			"paystack", `${API}/transaction/verify/${encodeURIComponent(reference)}`, { headers: headers() },
		).catch((e: ProviderError) => {
			if (e.status === 404 || e.status === 400) return null;
			throw e;
		});
		if (!r?.data) return { status: "pending", amount: null, currency: null, providerReference: null };
		const s = r.data.status;
		return {
			status: s === "success" ? "succeeded" : s === "failed" || s === "abandoned" || s === "reversed" ? "failed" : "pending",
			amount: r.data.amount,
			currency: r.data.currency?.toUpperCase() ?? null,
			providerReference: String(r.data.id),
			raw: { status: s, id: r.data.id },
		};
	},

	async parseWebhook(raw, h) {
		const sig = h.get("x-paystack-signature") ?? "";
		const expected = toHex(await hmac("SHA-512", key(), raw));
		if (!key() || !sig || !safeEqual(sig, expected)) throw new ProviderError("paystack", "Invalid webhook signature", 401);
		const body = JSON.parse(raw) as { event: string; data?: { id?: number; reference?: string } };
		return {
			eventId: `${body.event}:${body.data?.id ?? body.data?.reference ?? ""}`,
			type: body.event,
			reference: body.event.startsWith("charge.") ? body.data?.reference ?? null : null,
		};
	},

	async refund({ reference, amount }) {
		const r = await providerFetch<PsResponse<{ id: number; status: string }>>("paystack", `${API}/refund`, {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({ transaction: reference, amount }),
		});
		return { id: String(r.data.id), status: r.data.status === "processed" ? "succeeded" : "pending" };
	},
};
