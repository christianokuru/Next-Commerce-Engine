/* Minimal, safe service worker: never caches authenticated pages or API responses. */
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.svg"];

self.addEventListener("install", (e) => {
	e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
	e.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => ![STATIC, MEDIA].includes(k)).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (e) => {
	const req = e.request;
	if (req.method !== "GET") return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith("/api/")) return; // always network

	if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
		e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
			if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); }
			return res;
		})));
		return;
	}

	if (url.pathname.startsWith("/media/")) {
		e.respondWith(caches.open(MEDIA).then(async (c) => {
			const hit = await c.match(req);
			const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
			return hit || net;
		}));
		return;
	}

	if (req.mode === "navigate") {
		e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
	}
});
