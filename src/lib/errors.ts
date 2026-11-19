export type ErrorCode =
	| "not_found"
	| "invalid_data"
	| "unauthorized"
	| "forbidden"
	| "conflict"
	| "not_allowed"
	| "payment_error"
	| "rate_limited"
	| "unexpected";

const STATUS: Record<ErrorCode, number> = {
	not_found: 404,
	invalid_data: 400,
	unauthorized: 401,
	forbidden: 403,
	conflict: 409,
	not_allowed: 422,
	payment_error: 402,
	rate_limited: 429,
	unexpected: 500,
};

/** Domain error: safe to expose `message` to clients. */
export class CommerceError extends Error {
	constructor(
		public code: ErrorCode,
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = "CommerceError";
	}
	get status() {
		return STATUS[this.code];
	}
}

export const notFound = (what: string) => new CommerceError("not_found", `${what} not found`);
export const invalid = (msg: string, details?: unknown) => new CommerceError("invalid_data", msg, details);
export const notAllowed = (msg: string) => new CommerceError("not_allowed", msg);
