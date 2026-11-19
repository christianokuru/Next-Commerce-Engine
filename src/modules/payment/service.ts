import { and, desc, eq, gte } from "drizzle-orm";
import { db, transaction } from "@/db";
import { payments, refunds, webhookEvents, type PaymentProviderId } from "./schema";
import { carts } from "../cart/schema";
import { orders } from "../order/schema";
import { retrieveCart, assertCheckoutReady } from "../cart/service";
import { createOrderFromCart, addOrderEvent, type Order } from "../order/service";
import { getSettings } from "../store/service";
import { getProvider, supportsCurrency, allProviders } from "./providers";
import { ProviderError } from "./providers/types";
import { newId, randomToken } from "@/lib/id";
import { appUrl } from "@/lib/env";
import { CommerceError, invalid, notAllowed, notFound } from "@/lib/errors";

export type Payment = typeof payments.$inferSelect;

/** Providers usable for a currency: enabled in settings AND configured with secrets. */
export async function availableProviders(currency: string) {
	const settings = await getSettings();
	return allProviders()
		.filter((p) => settings.paymentProviders.includes(p.id) && p.isConfigured() && supportsCurrency(p, currency))
		.map((p) => ({ id: p.id, label: p.label }));
}

const REUSE_WINDOW_MS = 30 * 60_000;

/**
 * Start a hosted payment for a cart. Amount is ALWAYS computed server-side.
 * Idempotent: repeated calls with an unchanged cart reuse the pending session.
 */
export async function initiatePayment(cartId: string, providerId: string, opts: { cancelUrl?: string } = {}) {
	const provider = getProvider(providerId);
	if (!provider) throw invalid("Unknown payment provider");
	const cart = await retrieveCart(cartId);
	await assertCheckoutReady(cart);
	const available = await availableProviders(cart.currencyCode);
	if (!available.some((p) => p.id === provider.id)) throw notAllowed(`${provider.label} is not available for ${cart.currencyCode}`);

	const amount = cart.totals.total;
	const [reusable] = await db()
		.select()
		.from(payments)
		.where(
			and(
				eq(payments.cartId, cartId), eq(payments.provider, provider.id), eq(payments.status, "pending"),
				eq(payments.amount, amount), eq(payments.currencyCode, cart.currencyCode),
				gte(payments.createdAt, new Date(Date.now() - REUSE_WINDOW_MS)),
			),
		)
		.orderBy(desc(payments.createdAt))
		.limit(1);
	const reuseUrl = reusable?.data?.redirectUrl;
	if (reusable && typeof reuseUrl === "string") return { paymentId: reusable.id, redirectUrl: reuseUrl, reference: reusable.reference };

	const settings = await getSettings();
	const paymentId = newId("pay");
	const reference = `nce_${randomToken(18)}`;
	await db().insert(payments).values({
		id: paymentId, cartId, provider: provider.id, reference, amount, currencyCode: cart.currencyCode, status: "pending",
	});

	const callbackUrl = `${appUrl()}/api/payments/callback/${provider.id}?reference=${encodeURIComponent(reference)}`;
	const cancelUrl = opts.cancelUrl ?? (settings.storefrontUrl ? `${settings.storefrontUrl.replace(/\/$/, "")}/checkout` : `${appUrl()}/checkout/result?status=canceled`);
	try {
		const res = await provider.initialize({
			reference, amount, currency: cart.currencyCode, email: cart.email!, callbackUrl, cancelUrl,
			description: `Order from ${settings.name}`, metadata: { cart_id: cartId, payment_id: paymentId },
		});
		await db()
			.update(payments)
			.set({ providerReference: res.providerReference, data: { redirectUrl: res.redirectUrl } })
			.where(eq(payments.id, paymentId));
		return { paymentId, redirectUrl: res.redirectUrl, reference };
	} catch (e) {
		await db().update(payments).set({ status: "failed", failureReason: String((e as Error).message).slice(0, 500) }).where(eq(payments.id, paymentId));
		console.error("payment initialize failed", e);
		throw new CommerceError("payment_error", "Could not start payment. Please try again.");
	}
}

export type ConfirmResult =
	| { status: "succeeded"; order: Order }
	| { status: "pending" | "failed" | "requires_action"; order: null; paymentId: string };

/**
 * Verify a payment with the provider (server-to-server) and, if paid, complete the cart into an order.
 * Safe to call any number of times concurrently (redirect + webhooks): row locks + unique constraints
 * guarantee exactly one order per cart and one capture per payment.
 */
export async function confirmPayment(providerId: PaymentProviderId, reference: string): Promise<ConfirmResult> {
	const [payment] = await db().select().from(payments).where(and(eq(payments.reference, reference), eq(payments.provider, providerId)));
	if (!payment) throw notFound("Payment");

	if (payment.orderId) {
		const [order] = await db().select().from(orders).where(eq(orders.id, payment.orderId));
		if (order) return { status: "succeeded", order };
	}
	if (payment.status === "requires_action" || payment.status === "failed" || payment.status === "canceled")
		return { status: payment.status === "requires_action" ? "requires_action" : "failed", order: null, paymentId: payment.id };

	const provider = getProvider(providerId)!;
	const verified = await provider.verify({ reference: payment.reference, providerReference: payment.providerReference });

	if (verified.status === "pending") return { status: "pending", order: null, paymentId: payment.id };
	if (verified.status === "failed") {
		await db().update(payments).set({ status: "failed", failureReason: "Declined or abandoned", data: { ...payment.data, verify: verified.raw } })
			.where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
		return { status: "failed", order: null, paymentId: payment.id };
	}

	return transaction(async (tx) => {
		const [p] = await tx.select().from(payments).where(eq(payments.id, payment.id)).for("update");
		if (p.orderId) {
			const [order] = await tx.select().from(orders).where(eq(orders.id, p.orderId));
			return { status: "succeeded", order } as const;
		}
		if (p.status !== "pending") return { status: "requires_action", order: null, paymentId: p.id } as const;

		const flag = async (reason: string) => {
			await tx.update(payments).set({
				status: "requires_action", failureReason: reason, capturedAt: new Date(),
				providerReference: p.providerReference ?? verified.providerReference, data: { ...p.data, verify: verified.raw },
			}).where(eq(payments.id, p.id));
			console.warn("payment requires action", p.id, reason);
			return { status: "requires_action", order: null, paymentId: p.id } as const;
		};

		// The amount/currency the provider actually captured must equal what we asked for.
		if (verified.amount !== p.amount || verified.currency !== p.currencyCode) return flag("amount_mismatch");

		await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, p.cartId)).for("update");
		const cart = await retrieveCart(p.cartId, tx);
		if (cart.completedAt) return flag("duplicate_payment");
		// Cart changed after payment started (e.g. edited in another tab): never under-charge.
		if (cart.totals.total !== p.amount || cart.currencyCode !== p.currencyCode) return flag("cart_changed");

		const order = await createOrderFromCart(tx, cart, { paymentId: p.id });
		await tx.update(payments).set({
			status: "captured", orderId: order.id, capturedAt: new Date(),
			providerReference: p.providerReference ?? verified.providerReference, data: { ...p.data, verify: verified.raw },
		}).where(eq(payments.id, p.id));
		return { status: "succeeded", order, created: true } as const;
	}).then(async (r) => {
		if (r.status === "succeeded" && "created" in r && r.created) {
			const { onOrderPlaced } = await import("../notification/events");
			await onOrderPlaced(r.order.id);
		}
		return r.status === "succeeded" ? { status: "succeeded" as const, order: r.order } : r;
	});
}

/**
 * Webhook entry: verify signature, de-duplicate by provider event id, then reconcile by
 * re-verifying with the provider API (webhook body is never trusted for amounts/status).
 */
export async function handleWebhook(providerId: string, rawBody: string, headers: Headers) {
	const provider = getProvider(providerId);
	if (!provider) throw notFound("Provider");
	const event = await provider.parseWebhook(rawBody, headers); // throws ProviderError(401) if invalid

	const id = newId("whk");
	const inserted = await db()
		.insert(webhookEvents)
		.values({ id, provider: provider.id, eventId: event.eventId, type: event.type })
		.onConflictDoNothing()
		.returning({ id: webhookEvents.id });
	if (!inserted.length) {
		const [prev] = await db().select().from(webhookEvents).where(and(eq(webhookEvents.provider, provider.id), eq(webhookEvents.eventId, event.eventId)));
		if (prev && prev.status !== "failed") return { duplicate: true };
	}
	const rowId = inserted[0]?.id;
	const mark = (status: "processed" | "ignored" | "failed", error?: string) =>
		db().update(webhookEvents).set({ status, error, processedAt: new Date() })
			.where(rowId ? eq(webhookEvents.id, rowId) : and(eq(webhookEvents.provider, provider.id), eq(webhookEvents.eventId, event.eventId)));

	if (!event.reference) { await mark("ignored"); return { ignored: true }; }
	const [payment] = await db().select({ id: payments.id }).from(payments).where(eq(payments.reference, event.reference));
	if (!payment) { await mark("ignored", "unknown reference"); return { ignored: true }; }
	try {
		const r = await confirmPayment(provider.id, event.reference);
		await mark("processed");
		return { status: r.status };
	} catch (e) {
		await mark("failed", String((e as Error).message).slice(0, 500));
		throw e;
	}
}

/** Refund (full or partial) the captured payment of an order. */
export async function refundOrder(orderId: string, amount: number, opts: { reason?: string; actorId?: string } = {}) {
	if (!Number.isInteger(amount) || amount <= 0) throw invalid("Refund amount must be a positive integer");
	const [payment] = await db()
		.select()
		.from(payments)
		.where(and(eq(payments.orderId, orderId)))
		.orderBy(desc(payments.createdAt))
		.limit(1);
	if (!payment || !["captured", "partially_refunded"].includes(payment.status)) throw notAllowed("Order has no refundable payment");
	if (amount > payment.amount - payment.refundedAmount) throw notAllowed("Refund exceeds the remaining captured amount");

	const refundId = newId("ref");
	await db().insert(refunds).values({ id: refundId, paymentId: payment.id, amount, reason: opts.reason, actorId: opts.actorId });

	let result: Awaited<ReturnType<NonNullable<ReturnType<typeof getProvider>>["refund"]>>;
	try {
		result = await getProvider(payment.provider)!.refund({
			refundId, reference: payment.reference, providerReference: payment.providerReference, amount, currency: payment.currencyCode,
		});
	} catch (e) {
		await db().update(refunds).set({ status: "failed" }).where(eq(refunds.id, refundId));
		throw new CommerceError("payment_error", e instanceof ProviderError ? e.message : "Refund failed");
	}

	return transaction(async (tx) => {
		const [p] = await tx.select().from(payments).where(eq(payments.id, payment.id)).for("update");
		const refunded = p.refundedAmount + amount;
		const full = refunded >= p.amount;
		await tx.update(refunds).set({ status: result.status === "failed" ? "failed" : "succeeded", providerRefundId: result.id }).where(eq(refunds.id, refundId));
		if (result.status === "failed") throw new CommerceError("payment_error", "Provider rejected the refund");
		await tx.update(payments).set({ refundedAmount: refunded, status: full ? "refunded" : "partially_refunded" }).where(eq(payments.id, p.id));
		await tx.update(orders).set({ refundedTotal: refunded, paymentStatus: full ? "refunded" : "partially_refunded" }).where(eq(orders.id, orderId));
		await addOrderEvent(tx, orderId, "payment.refunded", { amount, providerRefundId: result.id, reason: opts.reason }, opts.actorId);
		return { refundId, amount, status: result.status };
	});
}

export async function listPaymentsNeedingAttention() {
	return db().select().from(payments).where(eq(payments.status, "requires_action")).orderBy(desc(payments.createdAt)).limit(50);
}
