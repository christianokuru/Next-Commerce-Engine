import { bindings } from "@/lib/env";
import { ulid } from "@/lib/id";
import { CommerceError, invalid } from "@/lib/errors";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
	{ type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
	{ type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
	{ type: "image/gif", ext: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
	{ type: "image/webp", ext: "webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
	{ type: "image/avif", ext: "avif", test: (b) => String.fromCharCode(...b.slice(4, 12)).startsWith("ftypavi") },
];

/** Detect type from magic bytes — never trust the client-provided MIME type. SVG is rejected (XSS). */
export function sniffImage(bytes: Uint8Array) {
	return SIGNATURES.find((s) => s.test(bytes)) ?? null;
}

function bucket(): R2Bucket {
	const b = (bindings() as { MEDIA?: R2Bucket }).MEDIA;
	if (!b) throw new CommerceError("unexpected", "Media storage (R2) is not configured");
	return b;
}

export async function uploadImage(file: File) {
	if (file.size > MAX_UPLOAD_BYTES) throw invalid("Image must be 8MB or smaller");
	const buf = new Uint8Array(await file.arrayBuffer());
	const kind = sniffImage(buf);
	if (!kind) throw invalid("Unsupported image type (use JPEG, PNG, WebP, AVIF or GIF)");
	const now = new Date();
	const key = `products/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${ulid().toLowerCase()}.${kind.ext}`;
	await bucket().put(key, buf, { httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=31536000, immutable" } });
	return { key, url: `/media/${key}`, contentType: kind.type, size: buf.byteLength };
}

export async function deleteImage(key: string) {
	if (!key.startsWith("products/")) return;
	await bucket().delete(key);
}

const ALLOWED_WIDTHS = [64, 128, 256, 400, 640, 960, 1280, 1920];

/**
 * Serve from R2, optionally resized/re-encoded by the Cloudflare Images binding.
 * Width is snapped to a fixed set to bound transformation cost and cache cardinality.
 */
export async function serveImage(req: Request, key: string) {
	if (!/^products\/[\w/.-]+$/.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
	const url = new URL(req.url);
	const w = Number(url.searchParams.get("w") ?? 0);
	const width = w ? ALLOWED_WIDTHS.find((x) => x >= w) ?? 1920 : 0;
	const accept = req.headers.get("accept") ?? "";
	const format = accept.includes("image/avif") ? "image/avif" : accept.includes("image/webp") ? "image/webp" : null;

	const cacheKey = new Request(`${url.origin}/media/${key}?w=${width}&f=${format ?? "orig"}`);
	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
	const hit = await cache?.match(cacheKey);
	if (hit) return hit;

	const obj = await bucket().get(key);
	if (!obj) return new Response("Not found", { status: 404 });
	const headers = new Headers({
		"Cache-Control": "public, max-age=31536000, immutable",
		"Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
		"X-Content-Type-Options": "nosniff",
		Vary: "Accept",
	});

	let res: Response | null = null;
	const images = (bindings() as { IMAGES?: ImagesBinding }).IMAGES;
	if (images && width && !key.endsWith(".gif")) {
		try {
			const out = await images
				.input(obj.body)
				.transform({ width, fit: "scale-down" })
				.output({ format: (format ?? "image/webp") as "image/webp" | "image/avif", quality: 82 });
			const r = out.response();
			headers.set("Content-Type", out.contentType());
			res = new Response(r.body, { headers });
		} catch (e) {
			console.warn("image transform failed, serving original", e);
		}
	}
	if (!res) {
		const original = width ? await bucket().get(key) : obj; // body stream may have been consumed
		if (!original) return new Response("Not found", { status: 404 });
		res = new Response(original.body, { headers });
	}
	if (cache) {
		const toCache = res.clone();
		await cache.put(cacheKey, toCache).catch(() => {});
	}
	return res;
}

/** Build a sized URL for an image path stored on a product. External URLs pass through. */
export function imageUrl(url: string | null | undefined, width?: number) {
	if (!url) return null;
	if (!url.startsWith("/media/") || !width) return url;
	return `${url}?w=${width}`;
}
