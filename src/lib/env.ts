import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Runtime env access. Secrets/vars are read from process.env (populated by
 * OpenNext/wrangler on Workers and by .env files in `next dev`).
 * Bindings (KV, R2, Images, rate limiters) come from the Cloudflare context.
 */
// Values copied verbatim from .env.example count as unset, so a copied example never breaks `npm run dev`.
const PLACEHOLDER = /ep-xxx|user:pass@|^generate-with-|^one-time-token-for-/;

export function env(name: string): string | undefined {
	const v = process.env[name]?.trim();
	return !v || PLACEHOLDER.test(v) ? undefined : v;
}

export function requireEnv(name: string): string {
	const v = env(name);
	if (!v)
		throw new Error(
			`Missing environment variable ${name}. Local dev needs none: run \`npm run dev\`. ` +
				"For `npm run preview` put it in .dev.vars; for production run `wrangler secret put " + name + "`.",
		);
	return v;
}

export function bindings(): Partial<CloudflareEnv> {
	try {
		return getCloudflareContext().env;
	} catch {
		return {};
	}
}

export function appUrl() {
	return (env("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
}
