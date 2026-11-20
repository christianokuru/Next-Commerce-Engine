/**
 * Payment module — payment records, refunds, webhook log and provider registry.
 * Orchestration (verify → complete cart → create order) lives in src/workflows/checkout.ts.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { payments, refunds, webhookEvents, type PaymentProviderId } from "./schema";
import { allProviders, supportsCurrency } from "./providers";
import { newId, randomToken } from "@/lib/id";

export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;

/** Providers usable for a currency: enabled by the merchant AND configured with secrets. */
export function usableProviders(enabled: string[], currency: string) {
	return allProviders()
		.filter((p) => enabled.includes(p.id) && p.isConfigured() && supportsCurrency(p, currency))
		.map((p) => ({ id: p.id, label: p.label }));
}

export async function findReusable(cartId: string, provider: PaymentProviderId, amount: number, currency: string, windowMs: number) {
	const [p] = await db().select().from(payments)
		.where(and(eq(payments.cartId, cartId), eq(payments.provider, provider), eq(payments.status, "pending"), eq(payments.amount, amount),
			eq(payments.currencyCode, currency), gte(payments.createdAt, new Date(Date.now() - windowMs))))
		.orderBy(desc(payments.createdAt)).limit(1);
	return p && typeof p.data?.redirectUrl === "string" ? p : null;
}

export async function createPayment(input: { cartId: string; provider: PaymentProviderId; amount: number; currencyCode: string; returnUrl?: string | null }) {
	const { returnUrl, ...row } = input;
	const [p] = await db().insert(payments).values({ id: newId("pay"), reference: `nce_${randomToken(18)}`, status: "pending", ...row, data: returnUrl ? { returnUrl } : null }).returning();
	return p;
}

/** jsonb merge so later writes never drop earlier keys (e.g. returnUrl). */
const mergeData = (patch: Record<string, unknown>) => sql`coalesce(${payments.data}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;

export async function setInitialized(id: string, providerReference: string | null, redirectUrl: string) {
	await db().update(payments).set({ providerReference, data: mergeData({ redirectUrl }) }).where(eq(payments.id, id));
}

export async function markFailed(id: string, reason: string, extra?: Record<string, unknown>) {
	await db().update(payments).set({ status: "failed", failureReason: reason.slice(0, 500), ...(extra ? { data: mergeData(extra) } : {}) })
		.where(and(eq(payments.id, id), eq(payments.status, "pending")));
}

export async function getByReference(provider: PaymentProviderId, reference: string) {
	const [p] = await db().select().from(payments).where(and(eq(payments.reference, reference), eq(payments.provider, provider)));
	return p ?? null;
}

export async function lock(tx: Db, id: string) {
	const [p] = await tx.select().from(payments).where(eq(payments.id, id)).for("update");
	return p;
}

export async function markCaptured(tx: Db, p: Payment, orderId: string, providerReference: string | null, verify?: Record<string, unknown>) {
	await tx.update(payments).set({ status: "captured", orderId, capturedAt: new Date(), providerReference: p.providerReference ?? providerReference, data: { ...p.data, verify } })
		.where(eq(payments.id, p.id));
}

export async function flagRequiresAction(tx: Db, p: Payment, reason: string, providerReference: string | null, verify?: Record<string, unknown>) {
	await tx.update(payments).set({ status: "requires_action", failureReason: reason, capturedAt: new Date(), providerReference: p.providerReference ?? providerReference, data: { ...p.data, verify } })
		.where(eq(payments.id, p.id));
}

export async function listForOrder(orderId: string) {
	return db().query.payments.findMany({ where: eq(payments.orderId, orderId), with: { refunds: true }, orderBy: desc(payments.createdAt) });
}

export async function listByCartIds(cartIds: string[]) {
	if (!cartIds.length) return [];
	return db().select({ cartId: payments.cartId }).from(payments).where(inArray(payments.cartId, cartIds));
}

export async function listNeedingAttention() {
	return db().select().from(payments).where(eq(payments.status, "requires_action")).orderBy(desc(payments.createdAt)).limit(50);
}

// ---------- Refunds ----------

export async function createRefund(paymentId: string, amount: number, reason?: string, actorId?: string) {
	const [r] = await db().insert(refunds).values({ id: newId("ref"), paymentId, amount, reason, actorId }).returning();
	return r;
}

export async function setRefundStatus(id: string, status: "succeeded" | "failed", providerRefundId?: string | null, tx?: Db) {
	await (tx ?? db()).update(refunds).set({ status, providerRefundId }).where(eq(refunds.id, id));
}

export async function applyRefund(tx: Db, paymentId: string, amount: number) {
	const p = await lock(tx, paymentId);
	const refundedAmount = p.refundedAmount + amount;
	const full = refundedAmount >= p.amount;
	await tx.update(payments).set({ refundedAmount, status: full ? "refunded" : "partially_refunded" }).where(eq(payments.id, p.id));
	return { refundedAmount, full };
}

// ---------- Webhook log (de-duplication) ----------

/** Returns false when this provider event was already received and not failed. */
export async function recordWebhook(provider: PaymentProviderId, eventId: string, type: string) {
	const inserted = await db().insert(webhookEvents).values({ id: newId("whk"), provider, eventId, type }).onConflictDoNothing().returning({ id: webhookEvents.id });
	if (inserted.length) return true;
	const [prev] = await db().select().from(webhookEvents).where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)));
	return prev?.status === "failed";
}

export async function markWebhook(provider: PaymentProviderId, eventId: string, status: "processed" | "ignored" | "failed", error?: string) {
	await db().update(webhookEvents).set({ status, error: error?.slice(0, 500), processedAt: new Date() })
		.where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)));
}
