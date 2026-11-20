import type { PaymentProviderId } from "../schema";
import type { PaymentProvider } from "./types";
import { paystack } from "./paystack";
import { flutterwave } from "./flutterwave";
import { stripe } from "./stripe";

const builtIn: Record<PaymentProviderId, PaymentProvider> = { paystack, flutterwave, stripe };

// Overrides live on globalThis so ones registered at startup (tests, `next dev` test mode) are seen by every route bundle.
const g = globalThis as { __ncePaymentOverrides?: Partial<Record<PaymentProviderId, PaymentProvider>> };
const registry = () => ({ ...builtIn, ...g.__ncePaymentOverrides });

export function getProvider(id: string): PaymentProvider | null {
	return (registry() as Record<string, PaymentProvider>)[id] ?? null;
}

export function allProviders() {
	return Object.values(registry());
}

/** Replace a provider implementation (tests, local test mode). */
export function registerProvider(p: PaymentProvider) {
	g.__ncePaymentOverrides = { ...g.__ncePaymentOverrides, [p.id]: p };
}

export function supportsCurrency(p: PaymentProvider, currency: string) {
	return p.currencies === null || p.currencies.includes(currency.toUpperCase());
}
