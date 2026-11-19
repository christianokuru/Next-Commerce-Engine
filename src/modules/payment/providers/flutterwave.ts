import { env } from "@/lib/env";
import { hmac, safeEqual, toBase64 } from "@/lib/crypto";
import { toMajor, toMinor } from "@/lib/money";
import { providerFetch, ProviderError, type PaymentProvider } from "./types";

const API = "https://api.flutterwave.com/v3";
const key = () => env("FLUTTERWAVE_SECRET_KEY") ?? "";
const headers = () => ({ Authorization: `Bearer ${key()}`, "Content-Type": "application/json" });

type FlwResponse<T> = { status: string; message: string; data: T };
type FlwTx = { id: number; tx_ref: string; status: string; amount: number; currency: string; charged_amount?: number };

export const flutterwave: PaymentProvider = {
	id: "flutterwave",
	label: "Flutterwave",
	currencies: ["NGN", "GHS", "KES", "ZAR", "UGX", "TZS", "RWF", "XAF", "XOF", "ZMW", "EGP", "USD", "EUR", "GBP"],
	isConfigured: () => Boolean(env("FLUTTERWAVE_SECRET_KEY") && env("FLUTTERWAVE_WEBHOOK_HASH")),

	async initialize(i) {
		const r = await providerFetch<FlwResponse<{ link: string }>>("flutterwave", `${API}/payments`, {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				tx_ref: i.reference,
				amount: toMajor(i.amount, i.currency), // Flutterwave expects major units
				currency: i.currency,
				redirect_url: i.callbackUrl,
				customer: { email: i.email },
				customizations: { title: i.description },
				meta: i.metadata,
			}),
		});
		if (r.status !== "success") throw new ProviderError("flutterwave", r.message);
		return { redirectUrl: r.data.link, providerReference: null };
	},

	async verify({ reference }) {
		const r = await providerFetch<FlwResponse<FlwTx>>(
			"flutterwave", `${API}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, { headers: headers() },
		).catch((e: ProviderError) => {
			if (e.status === 404 || e.status === 400) return null;
			throw e;
		});
		if (!r?.data) return { status: "pending", amount: null, currency: null, providerReference: null };
		const s = r.data.status;
		const currency = r.data.currency?.toUpperCase() ?? null;
		return {
			status: s === "successful" ? "succeeded" : s === "failed" ? "failed" : "pending",
			amount: currency ? toMinor(r.data.amount, currency) : null,
			currency,
			providerReference: String(r.data.id),
			raw: { status: s, id: r.data.id },
		};
	},

	async parseWebhook(raw, h) {
		const secretHash = env("FLUTTERWAVE_WEBHOOK_HASH") ?? "";
		if (!secretHash) throw new ProviderError("flutterwave", "Webhook hash not configured", 401);
		const v3 = h.get("verif-hash");
		const v4 = h.get("flutterwave-signature");
		let ok = false;
		if (v4) ok = safeEqual(v4, toBase64(await hmac("SHA-256", secretHash, raw)));
		else if (v3) ok = safeEqual(v3, secretHash);
		if (!ok) throw new ProviderError("flutterwave", "Invalid webhook signature", 401);
		const body = JSON.parse(raw) as { event?: string; type?: string; data?: { id?: number; tx_ref?: string } };
		const type = body.event ?? body.type ?? "unknown";
		return { eventId: `${type}:${body.data?.id ?? body.data?.tx_ref ?? ""}`, type, reference: body.data?.tx_ref ?? null };
	},

	async refund({ providerReference, amount, currency }) {
		if (!providerReference) throw new ProviderError("flutterwave", "Missing transaction id for refund");
		const r = await providerFetch<FlwResponse<{ id: number; status: string }>>("flutterwave", `${API}/transactions/${providerReference}/refund`, {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({ amount: toMajor(amount, currency) }),
		});
		return { id: String(r.data.id), status: r.data.status === "completed" ? "succeeded" : "pending" };
	},
};
