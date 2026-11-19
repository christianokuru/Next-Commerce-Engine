import type { PaymentProviderId } from "../schema";

export type InitializeInput = {
	reference: string;
	amount: number; // minor units
	currency: string;
	email: string;
	callbackUrl: string;
	cancelUrl: string;
	description: string;
	metadata: Record<string, string>;
};

export type InitializeResult = { redirectUrl: string; providerReference: string | null };

export type VerifyResult = {
	status: "succeeded" | "failed" | "pending";
	amount: number | null; // minor units
	currency: string | null;
	providerReference: string | null;
	raw?: Record<string, unknown>;
};

export type WebhookEvent = {
	eventId: string;
	type: string;
	/** Our merchant reference, when the event concerns a payment. */
	reference: string | null;
};

export interface PaymentProvider {
	id: PaymentProviderId;
	label: string;
	/** null = any currency. */
	currencies: string[] | null;
	isConfigured(): boolean;
	initialize(input: InitializeInput): Promise<InitializeResult>;
	/** Authoritative server-to-server verification. Never trust redirects/webhook bodies alone. */
	verify(p: { reference: string; providerReference: string | null }): Promise<VerifyResult>;
	/** Verifies signature and parses. Throws on invalid signature. */
	parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent>;
	refund(p: { refundId: string; reference: string; providerReference: string | null; amount: number; currency: string }): Promise<{ id: string | null; status: "succeeded" | "pending" | "failed" }>;
}

export class ProviderError extends Error {
	constructor(public provider: string, message: string, public status?: number) {
		super(`[${provider}] ${message}`);
	}
}

export async function providerFetch<T>(provider: string, url: string, init: RequestInit): Promise<T> {
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
	const text = await res.text();
	let body: unknown;
	try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
	if (!res.ok) {
		const msg = (body as { message?: string; error?: { message?: string } })?.message
			?? (body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
		throw new ProviderError(provider, msg, res.status);
	}
	return body as T;
}
