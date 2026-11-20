import { testSessions } from "@/dev/test-payments";
import { isAllowedRedirect } from "@/lib/origins";
import { appUrl } from "@/lib/env";

/**
 * Local test mode only. Marks the fake payment, then continues exactly like a real provider: a plain GET to the
 * engine's callback (which verifies and redirects to the storefront). A meta refresh is used instead of a 303 so the
 * cross-origin hop to the storefront isn't a form-submission redirect (CSP form-action stays strict).
 */
export async function POST(req: Request) {
	if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
	const fd = await req.formData();
	const s = testSessions().get(String(fd.get("reference") ?? ""));
	const outcome = String(fd.get("outcome") ?? "");
	let next = `${appUrl()}/dev/pay?error=expired`;
	if (s) {
		if (outcome === "cancel") next = (await isAllowedRedirect(s.cancelUrl)) ? s.cancelUrl : `${appUrl()}/checkout/result?status=canceled`;
		else {
			s.status = outcome === "pay" ? "succeeded" : "failed";
			if (s.callbackUrl.startsWith(`${appUrl()}/api/payments/callback/`)) next = s.callbackUrl;
		}
	}
	const esc = next.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
	return new Response(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${esc}"><title>Redirecting…</title><p style="font-family:sans-serif">Redirecting… <a href="${esc}">Continue</a></p>`, {
		headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
	});
}
