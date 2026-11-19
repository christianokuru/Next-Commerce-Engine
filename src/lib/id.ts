/**
 * Prefixed, time-sortable IDs (ULID-style, Crockford base32).
 * e.g. prod_01JH7X... — Web Crypto only, safe on Workers.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(ms: number, len = 10) {
	let out = "";
	for (let i = len - 1; i >= 0; i--) {
		const mod = ms % 32;
		out = ALPHABET[mod] + out;
		ms = (ms - mod) / 32;
	}
	return out;
}

function encodeRandom(len = 16) {
	const bytes = new Uint8Array(len);
	crypto.getRandomValues(bytes);
	let out = "";
	for (const b of bytes) out += ALPHABET[b % 32];
	return out;
}

export function ulid() {
	return encodeTime(Date.now()) + encodeRandom();
}

export type IdPrefix =
	| "prod" | "variant" | "price" | "img" | "opt" | "pcat" | "pcol"
	| "cus" | "addr" | "cart" | "item" | "promo" | "szone" | "so"
	| "order" | "oli" | "oevt" | "pay" | "ref" | "whk" | "imov";

export function newId(prefix: IdPrefix) {
	return `${prefix}_${ulid()}`;
}

/** Opaque random token (base64url), e.g. for payment references. */
export function randomToken(bytes = 24) {
	const b = new Uint8Array(bytes);
	crypto.getRandomValues(b);
	return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
