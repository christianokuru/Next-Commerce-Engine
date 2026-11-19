/**
 * Checkout workflows: start a hosted payment, confirm it (redirect or webhook) and complete the cart into an order.
 */
import { transaction } from "@/db";
import * as payment from "@/modules/payment/service";
import * as order from "@/modules/order/service";
import * as cartModule from "@/modules/cart/service";
import * as inventory from "@/modules/inventory/service";
import * as promotion from "@/modules/promotion/service";
import { getOrCreateByEmail } from "@/modules/customer/service";
import { getSettings } from "@/modules/store/service";
import { getProvider } from "@/modules/payment/providers";
import type { PaymentProviderId } from "@/modules/payment/schema";
import { retrieveCart, assertCheckoutReady } from "./cart";
import { runWorkflow } from "@/lib/workflow";
import { emit } from "@/lib/events";
import { appUrl } from "@/lib/env";
import { CommerceError, invalid, notAllowed, notFound } from "@/lib/errors";

const REUSE_WINDOW_MS = 30 * 60_000;

export async function availableProviders(currency: string) {
	return payment.usableProviders((await getSettings()).paymentProviders, currency);
}

/**
 * Start a hosted payment. Amount is ALWAYS computed server-side.
 * Idempotent: repeated calls with an unchanged cart reuse the pending session.
 */
export async function initiatePayment(cartId: string, providerId: string, opts: { cancelUrl?: string } = {}) {
	const provider = getProvider(providerId);
	if (!provider) throw invalid("Unknown payment provider");
	const cart = await retrieveCart(cartId);
	await assertCheckoutReady(cart);
	if (!(await availableProviders(cart.currencyCode)).some((p) => p.id === provider.id))
		throw notAllowed(`${provider.label} is not available for ${cart.currencyCode}`);

	const amount = cart.totals.total;
	const reusable = await payment.findReusable(cartId, provider.id, amount, cart.currencyCode, REUSE_WINDOW_MS);
	if (reusable) return { paymentId: reusable.id, redirectUrl: String(reusable.data!.redirectUrl), reference: reusable.reference };

	const settings = await getSettings();
	return runWorkflow("initiate-payment", async (step) => {
		const p = await step("create-payment", () => payment.createPayment({ cartId, provider: provider.id, amount, currencyCode: cart.currencyCode }),
			(created) => payment.markFailed(created.id, "Provider initialization failed"));
		const session = await step("provider-initialize", async () => {
			try {
				return await provider.initialize({
					reference: p.reference, amount, currency: cart.currencyCode, email: cart.email!,
					callbackUrl: `${appUrl()}/api/payments/callback/${provider.id}?reference=${encodeURIComponent(p.reference)}`,
					cancelUrl: opts.cancelUrl ?? (settings.storefrontUrl ? `${settings.storefrontUrl.replace(/\/$/, "")}/checkout` : `${appUrl()}/checkout/result?status=canceled`),
					description: `Order from ${settings.name}`, metadata: { cart_id: cartId, payment_id: p.id },
				});
			} catch (e) {
				console.error("payment initialize failed", e);
				throw new CommerceError("payment_error", "Could not start payment. Please try again.");
			}
		});
		await step("save-session", () => payment.setInitialized(p.id, session.providerReference, session.redirectUrl));
		return { paymentId: p.id, redirectUrl: session.redirectUrl, reference: p.reference };
	});
}

export type ConfirmResult =
	| { status: "succeeded"; order: order.Order }
	| { status: "pending" | "failed" | "requires_action"; order: null; paymentId: string };

/**
 * Verify with the provider (server-to-server) and, if paid, complete the cart into an order.
 * Safe under concurrency (redirect + webhooks): row locks + unique constraints guarantee exactly one order per cart.
 */
export async function confirmPayment(providerId: PaymentProviderId, reference: string): Promise<ConfirmResult> {
	const p0 = await payment.getByReference(providerId, reference);
	if (!p0) throw notFound("Payment");
	if (p0.orderId) {
		const o = await order.getOrderRow(p0.orderId);
		if (o) return { status: "succeeded", order: o };
	}
	if (["requires_action", "failed", "canceled"].includes(p0.status))
		return { status: p0.status === "requires_action" ? "requires_action" : "failed", order: null, paymentId: p0.id };

	const verified = await getProvider(providerId)!.verify({ reference: p0.reference, providerReference: p0.providerReference });
	if (verified.status === "pending") return { status: "pending", order: null, paymentId: p0.id };
	if (verified.status === "failed") {
		await payment.markFailed(p0.id, "Declined or abandoned", { ...p0.data, verify: verified.raw });
		return { status: "failed", order: null, paymentId: p0.id };
	}

	const result = await transaction(async (tx) => {
		const p = await payment.lock(tx, p0.id);
		if (p.orderId) return { status: "succeeded" as const, order: (await order.getOrderRow(p.orderId, tx))!, created: false };
		if (p.status !== "pending") return { status: "requires_action" as const, order: null, paymentId: p.id };
		const flag = async (reason: string) => {
			await payment.flagRequiresAction(tx, p, reason, verified.providerReference, verified.raw);
			console.warn("payment requires action", p.id, reason);
			return { status: "requires_action" as const, order: null, paymentId: p.id };
		};
		// What the provider captured must equal what we asked for.
		if (verified.amount !== p.amount || verified.currency !== p.currencyCode) return flag("amount_mismatch");

		await cartModule.lockCart(tx, p.cartId);
		const cart = await retrieveCart(p.cartId, tx);
		if (cart.completedAt) return flag("duplicate_payment");
		// Cart edited after the payment started: never under-charge.
		if (cart.totals.total !== p.amount || cart.currencyCode !== p.currencyCode) return flag("cart_changed");

		const settings = await getSettings();
		const customer = cart.customerId
			? { id: cart.customerId }
			: await getOrCreateByEmail(cart.email!, tx, { firstName: cart.shippingAddress?.firstName, lastName: cart.shippingAddress?.lastName, phone: cart.shippingAddress?.phone });
		const lines = cart.items.filter((i) => i.purchasable);
		const promo = cart.promotion && !cart.totals.promotionError ? cart.promotion : null;

		const o = await order.createOrder(tx, {
			cartId: cart.id, customerId: customer?.id ?? null, email: cart.email!, currencyCode: cart.currencyCode, taxInclusive: settings.taxInclusive,
			totals: { subtotal: cart.totals.subtotal, discountTotal: cart.totals.discountTotal, shippingTotal: cart.totals.shippingTotal, taxTotal: cart.totals.taxTotal, total: cart.totals.total },
			shippingAddress: cart.shippingAddress, billingAddress: cart.billingAddress,
			shippingMethod: cart.shippingOption ? { optionId: cart.shippingOption.id, name: cart.shippingOption.name, amount: cart.totals.shippingTotal } : null,
			promotion: promo,
			items: lines.map((i) => ({ productId: i.productId!, variantId: i.variantId, title: i.title, variantTitle: i.variantTitle, sku: i.sku, thumbnail: i.thumbnail, unitPrice: i.unitPrice!, quantity: i.quantity })),
		});
		const failed = await inventory.reserveForOrder(tx, lines.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), o.id);
		if (promo) await promotion.recordUsage(tx, promo.id);
		await cartModule.markCompleted(tx, cart.id);
		await order.addOrderEvent(tx, o.id, "order.placed", { paymentId: p.id, total: o.total });
		if (failed.length) {
			// Money is captured: keep the order, flag it for staff (restock or refund) — never oversell silently.
			await order.flagRequiresAction(tx, o.id, "inventory.insufficient", { variantIds: failed });
			o.status = "requires_action";
		}
		await payment.markCaptured(tx, p, o.id, verified.providerReference, verified.raw);
		return { status: "succeeded" as const, order: o, created: true };
	});

	if (result.status === "succeeded") {
		if (result.created) await emit("order.placed", { id: result.order.id });
		return { status: "succeeded", order: result.order };
	}
	return result;
}

/**
 * Webhook entry: verify signature, de-duplicate by provider event id, then reconcile by re-verifying
 * with the provider API (webhook bodies are never trusted for amounts/status).
 */
export async function handleWebhook(providerId: string, rawBody: string, headers: Headers) {
	const provider = getProvider(providerId);
	if (!provider) throw notFound("Provider");
	const event = await provider.parseWebhook(rawBody, headers); // throws ProviderError(401) if invalid
	if (!(await payment.recordWebhook(provider.id, event.eventId, event.type))) return { duplicate: true };
	const mark = (s: "processed" | "ignored" | "failed", err?: string) => payment.markWebhook(provider.id, event.eventId, s, err);

	if (!event.reference || !(await payment.getByReference(provider.id, event.reference))) {
		await mark("ignored", event.reference ? "unknown reference" : undefined);
		return { ignored: true };
	}
	try {
		const r = await confirmPayment(provider.id, event.reference);
		await mark("processed");
		return { status: r.status };
	} catch (e) {
		await mark("failed", String((e as Error).message));
		throw e;
	}
}
