import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { promotionCreate } from "@/server/admin-schemas";
import { createPromotion, listPromotions } from "@/modules/promotion/service";

export const GET = adminRoute(async () => ({ promotions: await listPromotions() }));
export const POST = adminRoute(async (req) => ({ id: await createPromotion(await body(req, promotionCreate)) }));
