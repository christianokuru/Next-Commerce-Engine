import { env } from "@/lib/env";
import { hmac, safeEqual, toHex } from "@/lib/crypto";
import { providerFetch, ProviderError, type PaymentProvider } from "./types";

/**
 * Stripe via its REST API with fetch + Web Crypto (no Node SDK) — runs natively on Workers.
 * Uses hosted Checkout Sessions so no card data touches this app.
 */
const API = "https://api.stripe.com/v1";
const key = () => env("STRIPE_SECRET_KEY") ?? "";

function form(obj: Record<string, string | number | undefined>) {
	const p = new URLSearchParams();
	for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
	return p;
}

const headers = (idempotencyKey?: string) => ({
	Authorization: `Bearer ${key()}`,
	"Content-Type": "application/x-www-form-urlencoded",
	"Stripe-Version": "2024-06-20",
	...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
});

type Session = {
	id: string; url: string | null; status: string; payment_status: string;
	amount_total: number | null; currency: string | null; payment_intent: string | null; client_reference_id: string | null;
};

const TOLERANCE_SECONDS = 300;

export const stripe: PaymentProvider = {
	id: "stripe",
	label: "Stripe",
	currencies: null,
	isConfigured: () => Boolean(env("STRIPE_SECRET_KEY") && env("STRIPE_WEBHOOK_SECRET")),

	async initialize(i) {
		const meta: Record<string, string> = {};
		for (const [k, v] of Object.entries({ ...i.metadata, reference: i.reference })) {
			meta[`metadata[${k}]`] = v;
			meta[`payment_intent_data[metadata][${k}]`] = v;
		}
		const s = await providerFetch<Session>("stripe", `${API}/checkout/sessions`, {
			method: "POST",
			headers: headers(`init_${i.reference}`),
			body: form({
				mode: "payment",
				client_reference_id: i.reference,
				customer_email: i.email,
				success_url: `${i.callbackUrl}${i.callbackUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
				cancel_url: i.cancelUrl,
				"line_items[0][quantity]": 1,
				"line_items[0][price_data][currency]": i.currency.toLowerCase(),
				"line_items[0][price_data][unit_amount]": i.amount,
				"line_items[0][price_data][product_data][name]": i.description,
				...meta,
			}),
		});
		if (!s.url) throw new ProviderError("stripe", "Checkout session has no URL");
		return { redirectUrl: s.url, providerReference: s.id };
	},

	async verify({ providerReference }) {
		if (!providerReference) return { status: "pending", amount: null, currency: null, providerReference: null };
		const s = await providerFetch<Session>("stripe", `${API}/checkout/sessions/${encodeURIComponent(providerReference)}`, { headers: headers() });
		return {
			status: s.payment_status === "paid" ? "succeeded" : s.status === "expired" ? "failed" : "pending",
			amount: s.amount_total,
			currency: s.currency?.toUpperCase() ?? null,
			providerReference: s.id,
			raw: { status: s.status, payment_status: s.payment_status, payment_intent: s.payment_intent },
		};
	},

	async parseWebhook(raw, h) {
		const secret = env("STRIPE_WEBHOOK_SECRET") ?? "";
		const header = h.get("stripe-signature") ?? "";
		const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]).filter((x) => x.length === 2));
		const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
		const t = Number(parts.t);
		if (!secret || !t || !signatures.length) throw new ProviderError("stripe", "Invalid webhook signature", 401);
		if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) throw new ProviderError("stripe", "Webhook timestamp outside tolerance", 401);
		const expected = toHex(await hmac("SHA-256", secret, `${t}.${raw}`));
		if (!signatures.some((s) => safeEqual(s, expected))) throw new ProviderError("stripe", "Invalid webhook signature", 401);
		const evt = JSON.parse(raw) as { id: string; type: string; data: { object: { object?: string; client_reference_id?: string; metadata?: Record<string, string> } } };
		const obj = evt.data.object;
		const reference = obj.object === "checkout.session" ? obj.client_reference_id ?? null : obj.metadata?.reference ?? null;
		return { eventId: evt.id, type: evt.type, reference };
	},

	async refund({ providerReference, amount, refundId }) {
		if (!providerReference) throw new ProviderError("stripe", "Missing session id for refund");
		const s = await providerFetch<Session>("stripe", `${API}/checkout/sessions/${encodeURIComponent(providerReference)}`, { headers: headers() });
		if (!s.payment_intent) throw new ProviderError("stripe", "Session has no payment intent");
		const r = await providerFetch<{ id: string; status: string }>("stripe", `${API}/refunds`, {
			method: "POST",
			headers: headers(`refund_${refundId}`),
			body: form({ payment_intent: s.payment_intent, amount }),
		});
		return { id: r.id, status: r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : "pending" };
	},
};
