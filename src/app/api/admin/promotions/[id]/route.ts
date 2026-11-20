import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { toggle } from "@/server/admin-schemas";
import { deletePromotion, setPromotionActive } from "@/modules/promotion/service";

type P = { id: string };
export const PATCH = adminRoute<P>(async (req, { params }) => { await setPromotionActive(params.id, (await body(req, toggle)).isActive); return { ok: true }; }, { feature: "discounts" });
export const DELETE = adminRoute<P>(async (_req, { params }) => { await deletePromotion(params.id); return { deleted: true }; }, { feature: "discounts" });
