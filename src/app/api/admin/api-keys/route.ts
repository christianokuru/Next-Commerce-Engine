import { z } from "zod";
import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { createApiKey, listApiKeys } from "@/modules/auth/service";

// Key management requires a signed-in admin (an API key cannot mint more keys).
export const GET = adminRoute(async () => ({ apiKeys: await listApiKeys() }), { sessionOnly: true, feature: "apiKeys" });
export const POST = adminRoute(async (req, { actor }) => {
	const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
	return createApiKey(name, actor.id);
}, { sessionOnly: true, feature: "apiKeys" });
