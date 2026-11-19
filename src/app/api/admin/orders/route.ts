import { z } from "zod";
import { adminRoute, query, pagination } from "@/server/admin-api";
import { listOrders } from "@/modules/order/service";
import { ORDER_STATUS } from "@/modules/order/schema";

export const GET = adminRoute(async (req) => listOrders(query(req, pagination.extend({ status: z.enum(ORDER_STATUS).optional() }))));
