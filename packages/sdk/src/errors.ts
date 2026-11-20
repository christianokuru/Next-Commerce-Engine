/**
 * Every failure is a CommerceError with a stable `code` you can branch on:
 *
 *   network_error   offline / DNS / CORS blocked            timeout     request took too long
 *   aborted         you cancelled it (AbortSignal)           invalid_data    bad input (see `details`)
 *   unauthorized    not signed in / session expired          forbidden       not allowed
 *   not_found       doesn't exist (or not in this plan)      not_allowed     business rule (out of stock, cart completed…)
 *   rate_limited    slow down (`retryAfter` seconds)         payment_error   provider couldn't start payment
 *   email_not_verified · invalid_credentials · user_exists · weak_password · invalid_token · origin_not_allowed
 *   unexpected      anything else (server error, bad response)
 */
export type CommerceErrorCode =
	| "network_error"
	| "timeout"
	| "aborted"
	| "invalid_data"
	| "unauthorized"
	| "forbidden"
	| "not_found"
	| "conflict"
	| "not_allowed"
	| "payment_error"
	| "rate_limited"
	| "email_not_verified"
	| "invalid_credentials"
	| "user_exists"
	| "weak_password"
	| "invalid_token"
	| "origin_not_allowed"
	| "unexpected";

export class CommerceError extends Error {
	readonly code: CommerceErrorCode;
	readonly status: number;
	readonly details?: unknown;
	/** Seconds to wait before retrying (rate limits). */
	readonly retryAfter?: number;

	constructor(code: CommerceErrorCode, message: string, opts: { status?: number; details?: unknown; retryAfter?: number; cause?: unknown } = {}) {
		super(message, { cause: opts.cause });
		this.name = "CommerceError";
		this.code = code;
		this.status = opts.status ?? 0;
		this.details = opts.details;
		this.retryAfter = opts.retryAfter;
	}
}

export function isCommerceError(e: unknown, code?: CommerceErrorCode): e is CommerceError {
	return e instanceof CommerceError && (code === undefined || e.code === code);
}

const BY_STATUS: Record<number, CommerceErrorCode> = {
	400: "invalid_data", 401: "unauthorized", 402: "payment_error", 403: "forbidden", 404: "not_found",
	409: "conflict", 422: "not_allowed", 429: "rate_limited",
};

/** Better Auth error codes → ours. */
const AUTH_CODES: Record<string, CommerceErrorCode> = {
	EMAIL_NOT_VERIFIED: "email_not_verified",
	INVALID_EMAIL_OR_PASSWORD: "invalid_credentials",
	INVALID_EMAIL: "invalid_data",
	INVALID_PASSWORD: "invalid_credentials",
	USER_ALREADY_EXISTS: "user_exists",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "user_exists",
	PASSWORD_TOO_SHORT: "weak_password",
	PASSWORD_TOO_LONG: "weak_password",
	INVALID_TOKEN: "invalid_token",
	TOKEN_EXPIRED: "invalid_token",
	INVALID_ORIGIN: "origin_not_allowed",
	INVALID_CALLBACKURL: "origin_not_allowed",
	INVALID_CALLBACK_URL: "origin_not_allowed",
	INVALID_REDIRECTURL: "origin_not_allowed",
	FAILED_TO_CREATE_USER: "invalid_data",
};

const FRIENDLY: Partial<Record<CommerceErrorCode, string>> = {
	network_error: "Can't reach the store. Check your connection and try again.",
	timeout: "The store is taking too long to respond. Please try again.",
	rate_limited: "Too many attempts. Please wait a moment and try again.",
	unexpected: "Something went wrong. Please try again.",
	origin_not_allowed: "This website isn't allowed to talk to the store yet (add it to STORE_CORS on the engine).",
};

/** Turn any error response body (Store API or Better Auth) into a CommerceError. */
export function toCommerceError(status: number, body: unknown, headers?: Headers): CommerceError {
	const b = (body ?? {}) as { error?: { code?: string; message?: string; issues?: unknown }; code?: string; message?: string };
	const retryAfter = parseRetryAfter(headers?.get("retry-after") ?? headers?.get("x-retry-after"));
	// Store API: { error: { code, message, issues? } }
	if (b.error && typeof b.error === "object") {
		const code = (b.error.code as CommerceErrorCode) ?? BY_STATUS[status] ?? "unexpected";
		return new CommerceError(code, b.error.message || FRIENDLY[code] || "Request failed", { status, details: b.error.issues, retryAfter });
	}
	// Better Auth: { code, message }
	const authCode = typeof b.code === "string" ? AUTH_CODES[b.code] : undefined;
	const message = typeof b.message === "string" ? b.message : undefined;
	if (!authCode && message && /invalid origin/i.test(message)) return new CommerceError("origin_not_allowed", FRIENDLY.origin_not_allowed!, { status, details: b });
	const code = authCode ?? BY_STATUS[status] ?? (status >= 500 ? "unexpected" : "unexpected");
	return new CommerceError(code, (status >= 500 ? FRIENDLY.unexpected : message) ?? FRIENDLY[code] ?? `Request failed (${status})`, { status, details: b, retryAfter });
}

export function parseRetryAfter(v: string | null | undefined): number | undefined {
	if (!v) return undefined;
	const n = Number(v);
	if (Number.isFinite(n)) return Math.max(0, n);
	const at = Date.parse(v);
	return Number.isFinite(at) ? Math.max(0, Math.round((at - Date.now()) / 1000)) : undefined;
}

export const friendlyMessage = (code: CommerceErrorCode) => FRIENDLY[code];
