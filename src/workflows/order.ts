/** Order lifecycle workflows: fulfillment, cancellation (restock), refunds (provider + DB). */
import { transaction } from "@/db";
import * as order from "@/modules/order/service";
import * as payment from "@/modules/payment/service";
import * as inventory from "@/modules/inventory/service";
import * as product from "@/modules/product/service";
import { getProvider } from "@/modules/payment/providers";
import { ProviderError } from "@/modules/payment/providers/types";
import { runWorkflow } from "@/lib/workflow";
import { emit } from "@/lib/events";
import { CommerceError, invalid, notAllowed, notFound } from "@/lib/errors";

export async function fulfillOrder(orderId: string, input: { status: order.FulfillmentStatus; trackingNumber?: string | null; carrier?: string | null }, actorId?: string) {
	const { before, after } = await order.updateFulfillment(orderId, input, actorId);
	if (after.fulfillmentStatus === "shipped" && before.fulfillmentStatus !== "shipped") await emit("order.shipped", { id: orderId });
	return after;
}

export async function cancelOrder(orderId: string, actorId?: string, opts: { restock?: boolean } = {}) {
	const restock = opts.restock !== false;
	const result = await transaction(async (tx) => {
		const r = await order.cancel(tx, orderId, actorId, { restocked: restock });
		if (r.alreadyCanceled || !restock) return r;
		const lines = r.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));
		const existing = await product.variantsExist(lines.map((l) => l.variantId), tx);
		await inventory.restock(tx, lines.filter((l) => existing.has(l.variantId)), orderId);
		return r;
	});
	if (!result.alreadyCanceled) await emit("order.canceled", { id: orderId });
	return result.order;
}

/** Refund (full or partial). The provider call is the irreversible step, so DB bookkeeping is retried-safe and failures are recorded. */
export async function refundOrder(orderId: string, amount: number, opts: { reason?: string; actorId?: string } = {}) {
	if (!Number.isInteger(amount) || amount <= 0) throw invalid("Refund amount must be a positive integer");
	const o = await order.getOrderRow(orderId);
	if (!o) throw notFound("Order");
	const p = (await payment.listForOrder(orderId)).find((x) => ["captured", "partially_refunded"].includes(x.status));
	if (!p) throw notAllowed("Order has no refundable payment");
	if (amount > p.amount - p.refundedAmount) throw notAllowed("Refund exceeds the remaining captured amount");

	return runWorkflow("refund-order", async (step) => {
		const refund = await step("create-refund", () => payment.createRefund(p.id, amount, opts.reason, opts.actorId),
			(r) => payment.setRefundStatus(r.id, "failed"));
		const result = await step("provider-refund", async () => {
			try {
				return await getProvider(p.provider)!.refund({ refundId: refund.id, reference: p.reference, providerReference: p.providerReference, amount, currency: p.currencyCode });
			} catch (e) {
				throw new CommerceError("payment_error", e instanceof ProviderError ? e.message : "Refund failed");
			}
		});
		if (result.status === "failed") throw new CommerceError("payment_error", "Provider rejected the refund");
		await transaction(async (tx) => {
			await payment.setRefundStatus(refund.id, "succeeded", result.id, tx);
			const { refundedAmount, full } = await payment.applyRefund(tx, p.id, amount);
			await order.recordRefund(tx, orderId, refundedAmount, full, { amount, providerRefundId: result.id, reason: opts.reason }, opts.actorId);
		});
		await emit("order.refunded", { id: orderId, amount });
		return { refundId: refund.id, amount, status: result.status };
	});
}
