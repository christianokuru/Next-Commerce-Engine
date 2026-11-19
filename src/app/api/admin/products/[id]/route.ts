import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { productUpdate } from "@/server/admin-schemas";
import { getProductDetail } from "@/queries/admin";
import { updateProduct } from "@/modules/product/service";
import { deleteProduct } from "@/workflows/catalog";

type P = { id: string };
export const GET = adminRoute<P>(async (_req, { params }) => {
	const product = await getProductDetail(params.id);
	if (!product) throw notFound("Product");
	return { product };
});
export const PATCH = adminRoute<P>(async (req, { params }) => {
	await updateProduct(params.id, await body(req, productUpdate));
	return { product: await getProductDetail(params.id) };
});
export const DELETE = adminRoute<P>(async (_req, { params }) => {
	await deleteProduct(params.id);
	return { deleted: true };
});
