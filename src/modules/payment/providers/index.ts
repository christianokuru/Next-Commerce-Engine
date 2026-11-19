import type { PaymentProviderId } from "../schema";
import type { PaymentProvider } from "./types";
import { paystack } from "./paystack";
import { flutterwave } from "./flutterwave";
import { stripe } from "./stripe";

const registry: Record<PaymentProviderId, PaymentProvider> = { paystack, flutterwave, stripe };

export function getProvider(id: string): PaymentProvider | null {
	return (registry as Record<string, PaymentProvider>)[id] ?? null;
}

export function allProviders() {
	return Object.values(registry);
}

/** For tests: replace a provider implementation. */
export function registerProvider(p: PaymentProvider) {
	registry[p.id] = p;
}

export function supportsCurrency(p: PaymentProvider, currency: string) {
	return p.currencies === null || p.currencies.includes(currency.toUpperCase());
}
