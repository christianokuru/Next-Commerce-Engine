import { adminRoute, query, pagination } from "@/server/admin-api";
import { body } from "@/lib/http";
import { productCreate } from "@/server/admin-schemas";
import { listProductsWithStock, getProductDetail } from "@/queries/admin";
import { createProduct } from "@/workflows/catalog";
import { z } from "zod";

export const GET = adminRoute(async (req) => {
	const q = query(req, pagination.extend({ status: z.enum(["draft", "published", "archived"]).optional() }));
	return listProductsWithStock(q);
});

export const POST = adminRoute(async (req) => {
	const id = await createProduct(await body(req, productCreate));
	return { id, product: await getProductDetail(id) };
});
