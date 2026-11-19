import { adminRoute, query, pagination } from "@/server/admin-api";
import { listCustomers } from "@/modules/customer/service";

export const GET = adminRoute(async (req) => listCustomers(query(req, pagination)));
