import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Runtime env access. Secrets/vars are read from process.env (populated by
 * OpenNext/wrangler on Workers and by .env files in `next dev`).
 * Bindings (KV, R2, Images, rate limiters) come from the Cloudflare context.
 */
export function env(name: string): string | undefined {
	const v = process.env[name];
	return v === "" ? undefined : v;
}

export function requireEnv(name: string): string {
	const v = env(name);
	if (!v) throw new Error(`Missing required environment variable: ${name}`);
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
