import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { paystack } from "@/modules/payment/providers/paystack";
import { stripe } from "@/modules/payment/providers/stripe";
import { flutterwave } from "@/modules/payment/providers/flutterwave";
import { sniffImage } from "@/modules/media/service";

beforeAll(() => {
	process.env.PAYSTACK_SECRET_KEY = "sk_test_ps";
	process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
	process.env.FLUTTERWAVE_WEBHOOK_HASH = "flw_hash";
});

describe("webhook signatures", () => {
	const body = JSON.stringify({ event: "charge.success", data: { id: 42, reference: "nce_abc" } });

	it("paystack HMAC-SHA512", async () => {
		const sig = createHmac("sha512", "sk_test_ps").update(body).digest("hex");
		const evt = await paystack.parseWebhook(body, new Headers({ "x-paystack-signature": sig }));
		expect(evt).toEqual({ eventId: "charge.success:42", type: "charge.success", reference: "nce_abc" });
		await expect(paystack.parseWebhook(body, new Headers({ "x-paystack-signature": "00" }))).rejects.toThrow(/signature/);
		await expect(paystack.parseWebhook(body + " ", new Headers({ "x-paystack-signature": sig }))).rejects.toThrow(/signature/);
	});

	it("stripe v1 signature with timestamp tolerance", async () => {
		const evt = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { object: "checkout.session", client_reference_id: "nce_x" } } });
		const t = Math.floor(Date.now() / 1000);
		const sig = createHmac("sha256", "whsec_test").update(`${t}.${evt}`).digest("hex");
		expect(await stripe.parseWebhook(evt, new Headers({ "stripe-signature": `t=${t},v1=${sig}` }))).toMatchObject({ eventId: "evt_1", reference: "nce_x" });
		const old = t - 3600;
		const oldSig = createHmac("sha256", "whsec_test").update(`${old}.${evt}`).digest("hex");
		await expect(stripe.parseWebhook(evt, new Headers({ "stripe-signature": `t=${old},v1=${oldSig}` }))).rejects.toThrow(/tolerance/);
		await expect(stripe.parseWebhook(evt, new Headers({ "stripe-signature": `t=${t},v1=deadbeef` }))).rejects.toThrow(/signature/);
	});

	it("flutterwave verif-hash and v4 HMAC", async () => {
		const evt = JSON.stringify({ event: "charge.completed", data: { id: 7, tx_ref: "nce_y", status: "successful" } });
		expect(await flutterwave.parseWebhook(evt, new Headers({ "verif-hash": "flw_hash" }))).toMatchObject({ reference: "nce_y" });
		await expect(flutterwave.parseWebhook(evt, new Headers({ "verif-hash": "nope" }))).rejects.toThrow();
		const v4 = createHmac("sha256", "flw_hash").update(evt).digest("base64");
		expect(await flutterwave.parseWebhook(evt, new Headers({ "flutterwave-signature": v4 }))).toMatchObject({ reference: "nce_y" });
	});
});

describe("upload sniffing", () => {
	it("accepts real image signatures and rejects SVG/HTML", () => {
		expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))?.type).toBe("image/png");
		expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.type).toBe("image/jpeg");
		expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
	});
});
