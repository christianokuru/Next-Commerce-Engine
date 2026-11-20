import "server-only";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getRole, verifyApiKey, looksLikeApiKey } from "@/modules/auth/service";
import { invalidate, CacheTags } from "@/lib/cache";
import { appUrl } from "@/lib/env";
import { CommerceError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";
import { requireFeature, type Feature } from "@/lib/plan";

export type AdminActor = { type: "user"; id: string } | { type: "api_key"; id: string; createdBy: string };

/**
 * Authenticate an Admin API request.
 * - `Authorization: Bearer nce_sk_…` → API key (created in Admin → Settings → API keys)
 * - otherwise the admin's session (cookie or Better Auth bearer token), always DB-verified
 * Cookie-authenticated mutations must come from our own origin (CSRF guard).
 */
export async function authenticateAdmin(req: Request): Promise<AdminActor> {
	const authz = req.headers.get("authorization") ?? "";
	const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
	if (token && looksLikeApiKey(token)) {
		requireFeature("apiKeys");
		const key = await verifyApiKey(token);
		if (!key) throw new CommerceError("unauthorized", "Invalid or revoked API key");
		return { type: "api_key", id: key.id, createdBy: key.createdBy };
	}
	if (!token && req.method !== "GET" && req.method !== "HEAD") {
		const origin = req.headers.get("origin");
		if (origin && origin !== new URL(appUrl()).origin) throw new CommerceError("forbidden", "Cross-origin request rejected");
	}
	const s = await auth().api.getSession({ headers: req.headers, query: { disableCookieCache: true } });
	if (!s) throw new CommerceError("unauthorized", "Authentication required");
	if ((await getRole(s.user.id)) !== "admin") throw new CommerceError("forbidden", "Admin access required");
	return { type: "user", id: s.user.id };
}

export const actorId = (a: AdminActor) => (a.type === "user" ? a.id : `api_key:${a.id}`);

type Handler<P> = (req: Request, ctx: { params: P; actor: AdminActor }) => Promise<Response | unknown>;

/** Admin route wrapper: auth → handler → JSON; invalidates public caches after successful mutations. */
export function adminRoute<P = Record<string, string>>(fn: Handler<P>, opts: { sessionOnly?: boolean; feature?: Feature } = {}) {
	return async (req: Request, ctx: { params: Promise<P> }) => {
		try {
			const actor = await authenticateAdmin(req);
			if (opts.sessionOnly && actor.type !== "user") throw new CommerceError("forbidden", "This endpoint requires a signed-in admin");
			if (opts.feature) requireFeature(opts.feature);
			const out = await fn(req, { params: await ctx.params, actor });
			if (req.method !== "GET") await invalidate(CacheTags.catalog);
			if (out instanceof Response) return out;
			return json(req, out ?? { ok: true }, { status: req.method === "POST" && out && typeof out === "object" && "id" in out ? 201 : 200 });
		} catch (e) {
			return errorResponse(req, e);
		}
	};
}

export function query<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
	return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}

export const pagination = z.object({
	q: z.string().max(100).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});
