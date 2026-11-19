import { handleWebhook } from "@/workflows/checkout";
import { ProviderError } from "@/modules/payment/providers/types";
import { CommerceError } from "@/lib/errors";

/** POST /api/webhooks/{paystack|flutterwave|stripe} — raw body is required for signature checks. */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
	const { provider } = await ctx.params;
	const raw = await req.text();
	if (raw.length > 512_000) return new Response("Payload too large", { status: 413 });
	try {
		const result = await handleWebhook(provider, raw, req.headers);
		return Response.json({ received: true, ...result });
	} catch (e) {
		if (e instanceof ProviderError && e.status === 401) return new Response("Invalid signature", { status: 401 });
		if (e instanceof CommerceError && e.code === "not_found") return new Response("Not found", { status: 404 });
		console.error("webhook processing failed", provider, e);
		// 500 → provider retries later; idempotency makes retries safe.
		return new Response("Webhook processing failed", { status: 500 });
	}
}
