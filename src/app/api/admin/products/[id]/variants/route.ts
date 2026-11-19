import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { variantCreate } from "@/server/admin-schemas";
import { addVariant } from "@/workflows/catalog";

export const POST = adminRoute<{ id: string }>(async (req, { params }) => ({ id: await addVariant(params.id, await body(req, variantCreate)) }));
