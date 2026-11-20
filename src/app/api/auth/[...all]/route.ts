import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { corsHeaders, preflight } from "@/lib/http";

/** Headless storefronts on another origin call these from the browser, so they need CORS (same allow-list as the Store API). */
async function withCors(req: Request, res: Response) {
	const headers = corsHeaders(req);
	if (!Object.keys(headers).length) return res;
	const out = new Response(res.body, res);
	for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
	return out;
}

export const OPTIONS = preflight;
export const GET = async (req: Request) => withCors(req, await toNextJsHandler(auth().handler).GET(req));
export const POST = async (req: Request) => withCors(req, await toNextJsHandler(auth().handler).POST(req));
