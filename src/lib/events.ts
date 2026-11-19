import { runInBackground } from "./background";

/** Domain events. Subscribers (src/subscribers) run after the response via waitUntil, never inside DB transactions. */
export type DomainEvents = {
	"order.placed": { id: string };
	"order.shipped": { id: string };
	"order.canceled": { id: string };
	"order.refunded": { id: string; amount: number };
};

export async function emit<E extends keyof DomainEvents>(event: E, payload: DomainEvents[E]) {
	const { subscribers } = await import("@/subscribers");
	const handlers = (subscribers[event] ?? []) as ((p: DomainEvents[E]) => Promise<void>)[];
	if (!handlers.length) return;
	await runInBackground(async () => {
		const results = await Promise.allSettled(handlers.map((h) => h(payload)));
		for (const r of results) if (r.status === "rejected") console.error(`[event:${event}] subscriber failed`, r.reason);
	});
}
