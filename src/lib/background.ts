import { after } from "next/server";

/**
 * Run work after the response is sent (Next.js `after` → Workers `ctx.waitUntil` on OpenNext).
 * Falls back to awaiting inline outside a request scope (scripts/tests).
 */
export async function runInBackground(task: () => Promise<unknown>) {
	const safe = () => task().catch((e) => console.error("background task failed", e));
	try {
		after(safe);
	} catch {
		await safe();
	}
}
