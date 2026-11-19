import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { shippingOptionCreate } from "@/server/admin-schemas";
import { createOption } from "@/modules/shipping/service";

export const POST = adminRoute<{ id: string }>(async (req, { params }) => ({ id: await createOption({ ...(await body(req, shippingOptionCreate)), zoneId: params.id }) }));
