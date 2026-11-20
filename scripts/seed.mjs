// Adds demo products to the running `npm run dev` server (local only).
const base = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
try {
	const res = await fetch(`${base}/api/dev/seed`, { method: "POST" });
	if (res.status === 404) throw new Error("Seeding only works against `npm run dev`.");
	console.log(await res.json());
} catch (e) {
	console.error(`Could not seed ${base}: ${e.message}\nStart the engine first with: npm run dev`);
	process.exit(1);
}
