import { env } from "@/lib/env";

export type Email = { to: string | string[]; subject: string; html: string; text?: string; replyTo?: string };

/** Resend over plain fetch (Workers-native). Logs instead of sending when no API key is configured. */
export async function sendEmail(e: Email) {
	const key = env("RESEND_API_KEY");
	const from = env("EMAIL_FROM") ?? "Store <onboarding@resend.dev>";
	if (!key) {
		console.log(`[email:dev] to=${String(e.to)} subject="${e.subject}"\n${e.text ?? e.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600)}`);
		return { id: null, skipped: true };
	}
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
		body: JSON.stringify({ from, to: e.to, subject: e.subject, html: e.html, text: e.text, reply_to: e.replyTo }),
		signal: AbortSignal.timeout(10000),
	});
	if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 300)}`);
	return (await res.json()) as { id: string };
}
