import { z } from "zod";
import { CommerceError } from "./errors";

export type ActionState = { ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; data?: unknown } | null;

/** Normalize server-action errors into a serializable state (never leak internals). */
export function toActionError(e: unknown): ActionState {
	if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e; // redirect/notFound
	if (e instanceof CommerceError) return { ok: false, error: e.message };
	if (e instanceof z.ZodError) {
		const fieldErrors: Record<string, string> = {};
		for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
		const first = e.issues[0];
		return { ok: false, error: first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input", fieldErrors };
	}
	console.error(e);
	return { ok: false, error: "Something went wrong. Please try again." };
}

export function formObject(fd: FormData) {
	const o: Record<string, string> = {};
	for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
	return o;
}

/** Helpers for coercing HTML form strings. */
export const f = {
	text: (max = 500) => z.string().trim().max(max),
	optText: (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : null)),
	bool: z.string().optional().transform((v) => v === "on" || v === "true"),
	int: z.coerce.number().int(),
	optInt: z.string().optional().transform((v, ctx) => {
		if (!v?.trim()) return null;
		const n = Number(v);
		if (!Number.isInteger(n)) { ctx.addIssue({ code: "custom", message: "Must be a whole number" }); return z.NEVER; }
		return n;
	}),
	/** Major-unit decimal string → minor units. */
	money: (currency = "NGN") => z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount").transform((v) => Math.round(Number(v) * (["JPY","KRW"].includes(currency) ? 1 : 100))),
	optMoney: z.string().trim().optional().transform((v, ctx) => {
		if (!v) return null;
		if (!/^\d+(\.\d{1,2})?$/.test(v)) { ctx.addIssue({ code: "custom", message: "Enter a valid amount" }); return z.NEVER; }
		return Math.round(Number(v) * 100);
	}),
};
