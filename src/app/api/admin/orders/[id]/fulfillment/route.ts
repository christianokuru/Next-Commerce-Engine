import { adminRoute, actorId } from "@/server/admin-api";
import { body } from "@/lib/http";
import { fulfillment } from "@/server/admin-schemas";
import { fulfillOrder } from "@/workflows/order";

export const POST = adminRoute<{ id: string }>(async (req, { params, actor }) => ({ order: await fulfillOrder(params.id, await body(req, fulfillment), actorId(actor)) }));
