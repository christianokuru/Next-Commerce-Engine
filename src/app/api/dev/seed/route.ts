import { invalidate, CacheTags } from "@/lib/cache";

/** Local development only (`npm run seed`). 404 in production. */
export async function POST() {
	if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
	const { seedDemo } = await import("@/dev/seed");
	const result = await seedDemo();
	await invalidate(CacheTags.catalog);
	await invalidate(CacheTags.settings);
	return Response.json(result);
}
