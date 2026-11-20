import { testSessions } from "@/dev/test-payments";
import { formatMoney } from "@/lib/money";

/**
 * Local test mode only: a fake "hosted payment page" so checkout works end to end without provider keys.
 * Plain HTML (no React/HMR) so it behaves like an external provider page.
 */
export async function GET(req: Request) {
	if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
	const url = new URL(req.url);
	const reference = url.searchParams.get("reference") ?? "";
	const provider = (url.searchParams.get("provider") ?? "provider").replace(/[^a-z]/gi, "");
	const s = testSessions().get(reference);
	const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
	const amount = s ? esc(formatMoney(s.amount, s.currency)) : "";
	const body = !s || url.searchParams.get("error")
		? `<p>This test payment has expired. Start checkout again from the store.</p>`
		: `<p class="muted">Amount to pay</p><p class="amount">${amount}</p><p class="ref">${esc(reference)}</p>
			<form method="post" action="/dev/pay/complete">
				<input type="hidden" name="reference" value="${esc(reference)}">
				<button name="outcome" value="pay" class="primary">Pay ${amount}</button>
				<button name="outcome" value="fail">Simulate a declined card</button>
				<button name="outcome" value="cancel" class="link">Cancel and return to store</button>
			</form>
			<p class="muted small">Shown because this provider has no API keys in local development. With real keys, shoppers see the provider's own secure page.</p>`;
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Test payment</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f4efe9;color:#1b1712;font-family:system-ui,sans-serif;padding:20px}main{width:100%;max-width:380px;border-top:2px solid #1b1712;padding-top:24px}.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#b5401c}h1{font-family:Georgia,serif;font-weight:400;font-size:30px;margin:8px 0 0}.muted{color:#6b6259;font-size:14px}.small{font-size:12px;margin-top:24px}.amount{font-family:Georgia,serif;font-size:44px;margin:0}.ref{font-family:monospace;font-size:11px;color:#6b6259;word-break:break-all}form{display:grid;gap:8px;margin-top:28px}button{height:44px;border:1px solid #1b1712;background:transparent;font-size:14px;cursor:pointer}button.primary{background:#1b1712;color:#fff}button.link{border:0;text-decoration:underline}</style></head>
<body><main><p class="eyebrow">Test mode · no real money</p><h1>${esc(provider.charAt(0).toUpperCase() + provider.slice(1))} checkout</h1>${body}</main></body></html>`;
	return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
