import { z } from "zod";
import { CommerceError } from "./errors";
import { bindings } from "./env";
import { isCorsOrigin } from "./origins";

export function corsHeaders(req: Request): Record<string, string> {
	const origin = req.headers.get("origin");
	if (!isCorsOrigin(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Expose-Headers": "set-auth-token",
		"Access-Control-Max-Age": "600",
		Vary: "Origin",
	};
}

export function json(req: Request, data: unknown, init: ResponseInit = {}) {
	return Response.json(data, {
		...init,
		headers: { "Cache-Control": "no-store", ...corsHeaders(req), ...(init.headers as Record<string, string>) },
	});
}

export function errorResponse(req: Request, e: unknown) {
	if (e instanceof CommerceError) return json(req, { error: { code: e.code, message: e.message } }, { status: e.status });
	if (e instanceof z.ZodError)
		return json(req, { error: { code: "invalid_data", message: "Invalid request", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 400 });
	if (e instanceof SyntaxError) return json(req, { error: { code: "invalid_data", message: "Malformed JSON" } }, { status: 400 });
	console.error(e);
	return json(req, { error: { code: "unexpected", message: "Something went wrong" } }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

/** Wrap a route handler with uniform error handling + CORS. */
export function route<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<Response | unknown>) {
	return async (req: Request, ctx: Ctx<P>) => {
		try {
			const out = await fn(req, await ctx.params);
			return out instanceof Response ? out : json(req, out);
		} catch (e) {
			return errorResponse(req, e);
		}
	};
}

export function preflight(req: Request) {
	return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
	// JSON only: cross-site "simple" requests (text/plain, form posts) can't reach mutations.
	if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
		throw new CommerceError("invalid_data", "Content-Type must be application/json");
	const len = Number(req.headers.get("content-length") ?? 0);
	if (len > 64_000) throw new CommerceError("invalid_data", "Payload too large");
	const data = await req.json().catch(() => {
		throw new SyntaxError("bad json");
	});
	return schema.parse(data);
}

export function clientIp(req: Request) {
	return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Workers Rate Limiting binding (per-colo, eventually consistent). No-op when the binding is
 * absent (e.g. `next dev`).
 */
export async function rateLimit(req: Request, bucket: string) {
	const limiter = (bindings() as { RATE_LIMITER?: RateLimit }).RATE_LIMITER;
	if (!limiter) return;
	let success = true;
	try {
		({ success } = await limiter.limit({ key: `${bucket}:${clientIp(req)}` }));
	} catch (e) {
		// Fail open: a rate-limiter outage must never take checkout down with it.
		console.error("rate limiter unavailable", e);
	}
	if (!success) throw new CommerceError("rate_limited", "Too many requests, slow down");
}
