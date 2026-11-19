const enc = new TextEncoder();

export async function hmac(algo: "SHA-256" | "SHA-512", secret: string, data: string) {
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: algo }, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
	const x = enc.encode(a);
	const y = enc.encode(b);
	let diff = x.length ^ y.length;
	const len = Math.max(x.length, y.length);
	for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}
