/**
 * Which browser origins may talk to this engine: one list drives CORS (Store API + auth),
 * Better Auth's trusted origins, and allowed payment return/cancel URLs.
 *
 *   APP_URL                     this engine (always allowed)
 *   STORE_CORS                  storefront origins, comma-separated (e.g. https://clientbrand.com)
 *   Settings → Storefront URL   also allowed for redirects
 *   `next dev`                  any http://localhost:* / 127.0.0.1:* (zero-config local storefronts)
 */
import { appUrl, env } from "./env";

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export const isDevLocalhost = (origin: string) => process.env.NODE_ENV === "development" && LOCALHOST.test(origin);

export function corsOrigins(): string[] {
	return (env("STORE_CORS") ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}

/** CORS check (sync, no DB): STORE_CORS, or localhost during development. */
export function isCorsOrigin(origin: string | null): origin is string {
	return Boolean(origin) && (corsOrigins().includes(origin!) || isDevLocalhost(origin!));
}

export function originOf(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
	} catch {
		return null;
	}
}

/** Origins allowed as redirect targets (payment return/cancel, email links). */
export async function trustedOrigins(): Promise<string[]> {
	const { getSettings } = await import("@/modules/store/service");
	const storefront = originOf((await getSettings().catch(() => null))?.storefrontUrl);
	const extra = (env("TRUSTED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	return [...new Set([originOf(appUrl())!, ...corsOrigins(), ...extra, ...(storefront ? [storefront] : [])])];
}

/** A URL we may send a shopper to after payment: http(s) on a trusted origin. */
export async function isAllowedRedirect(url: string): Promise<boolean> {
	const origin = originOf(url);
	if (!origin) return false;
	return isDevLocalhost(origin) || (await trustedOrigins()).includes(origin);
}
