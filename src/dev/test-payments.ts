/**
 * `npm run dev` only: providers without keys run in TEST MODE so the full checkout works locally.
 * The shopper is sent to /dev/pay (a fake hosted payment page) instead of Paystack/Flutterwave/Stripe.
 * Never bundled for production (imported from instrumentation behind a NODE_ENV check).
 */
import { allProviders, registerProvider } from "@/modules/payment/providers";
import type { PaymentProvider, VerifyResult } from "@/modules/payment/providers/types";
import { appUrl } from "@/lib/env";

type Session = { amount: number; currency: string; status: VerifyResult["status"]; callbackUrl: string; cancelUrl: string };
const g = globalThis as { __nceTestPayments?: Map<string, Session> };
export const testSessions = () => (g.__nceTestPayments ??= new Map());

export function enableTestPayments() {
	for (const real of allProviders()) {
		if (real.isConfigured()) continue; // real keys present → use the real provider
		const test: PaymentProvider = {
			...real,
			label: `${real.label} (test mode)`,
			isConfigured: () => true,
			async initialize(i) {
				testSessions().set(i.reference, { amount: i.amount, currency: i.currency, status: "pending", callbackUrl: i.callbackUrl, cancelUrl: i.cancelUrl });
				const qs = new URLSearchParams({ provider: real.id, reference: i.reference });
				return { redirectUrl: `${appUrl()}/dev/pay?${qs}`, providerReference: `test_${i.reference}` };
			},
			async verify({ reference }) {
				const s = testSessions().get(reference);
				return { status: s?.status ?? "failed", amount: s?.amount ?? null, currency: s?.currency ?? null, providerReference: `test_${reference}` };
			},
			async parseWebhook() {
				throw new Error("Test mode has no webhooks");
			},
			async refund({ refundId }) {
				return { id: `test_${refundId}`, status: "succeeded" };
			},
		};
		registerProvider(test);
	}
}
