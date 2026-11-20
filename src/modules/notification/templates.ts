import { formatMoney } from "@/lib/money";

const esc = (s: unknown) =>
	String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(store: string, title: string, body: string) {
	return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:18px;font-weight:600;padding-bottom:16px">${esc(store)}</td></tr>
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">${esc(title)}</td></tr>
<tr><td style="font-size:14px;line-height:1.6">${body}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
	`<p style="margin:20px 0"><a href="${esc(href)}" style="background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(label)}</a></p>`;

export function actionEmail(store: string, title: string, intro: string, href: string, cta: string) {
	return {
		subject: `${title} — ${store}`,
		html: layout(store, title, `<p>${esc(intro)}</p>${button(href, cta)}<p style="color:#666;font-size:12px">If you didn't request this, you can ignore this email.</p>`),
		text: `${intro}\n\n${cta}: ${href}`,
	};
}

type OrderForEmail = {
	displayId: number; currencyCode: string; subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; total: number;
	taxInclusive: boolean; items: { title: string; variantTitle: string | null; quantity: number; total: number }[];
	shippingAddress: { firstName: string; lastName: string; address1: string; city: string; countryCode: string } | null;
};

/** accountUrl is null when the store has no customer accounts (guest checkout only). */
export function orderConfirmationEmail(store: string, o: OrderForEmail, accountUrl: string | null) {
	const m = (n: number) => esc(formatMoney(n, o.currencyCode));
	const rows = o.items
		.map((i) => `<tr><td style="padding:6px 0">${esc(i.title)}${i.variantTitle && i.variantTitle !== "Default" ? ` <span style="color:#666">(${esc(i.variantTitle)})</span>` : ""} × ${i.quantity}</td><td align="right">${m(i.total)}</td></tr>`)
		.join("");
	const line = (label: string, v: string) => `<tr><td style="padding:4px 0;color:#555">${label}</td><td align="right">${v}</td></tr>`;
	const a = o.shippingAddress;
	const body = `<p>Thanks for your order! We're getting it ready.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:12px 0">${rows}</table>
<table width="100%" cellpadding="0" cellspacing="0">
${line("Subtotal", m(o.subtotal))}
${o.discountTotal ? line("Discount", `-${m(o.discountTotal)}`) : ""}
${line("Shipping", m(o.shippingTotal))}
${o.taxTotal ? line(o.taxInclusive ? "Tax (included)" : "Tax", m(o.taxTotal)) : ""}
<tr><td style="padding-top:8px;font-weight:600">Total</td><td align="right" style="padding-top:8px;font-weight:600">${m(o.total)}</td></tr>
</table>
${a ? `<p style="margin-top:16px"><strong>Shipping to</strong><br>${esc(a.firstName)} ${esc(a.lastName)}<br>${esc(a.address1)}, ${esc(a.city)}, ${esc(a.countryCode)}</p>` : ""}
${accountUrl ? button(accountUrl, "View your order") : ""}`;
	return { subject: `Order #${o.displayId} confirmed — ${store}`, html: layout(store, `Order #${o.displayId} confirmed`, body) };
}

export function adminNewOrderEmail(store: string, o: { displayId: number; email: string; total: number; currencyCode: string; status: string }, url: string) {
	return {
		subject: `New order #${o.displayId} — ${formatMoney(o.total, o.currencyCode)}`,
		html: layout(store, `New order #${o.displayId}`, `<p>${esc(o.email)} placed an order for <strong>${esc(formatMoney(o.total, o.currencyCode))}</strong>.</p>${o.status === "requires_action" ? `<p style="color:#b45309"><strong>Requires action:</strong> insufficient stock for one or more items.</p>` : ""}${button(url, "Open in dashboard")}`),
	};
}

export function shippedEmail(store: string, o: { displayId: number; trackingNumber: string | null; carrier: string | null }, url: string | null) {
	const tracking = o.trackingNumber ? `<p>Tracking: <strong>${esc(o.carrier ?? "")} ${esc(o.trackingNumber)}</strong></p>` : "";
	return {
		subject: `Order #${o.displayId} has shipped — ${store}`,
		html: layout(store, `Your order is on its way`, `<p>Order #${o.displayId} has shipped.</p>${tracking}${url ? button(url, "View order") : ""}`),
	};
}
