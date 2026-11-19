import { z } from "zod";
import { adminRoute, query } from "@/server/admin-api";
import { listInventory } from "@/queries/admin";

export const GET = adminRoute(async (req) => {
	const { low } = query(req, z.object({ low: z.enum(["1", "true"]).optional() }));
	return { inventory: await listInventory({ lowStockOnly: Boolean(low) }) };
});
