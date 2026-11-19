import { adminRoute } from "@/server/admin-api";
import { getCustomerDetail } from "@/queries/admin";
import { notFound } from "@/lib/errors";

export const GET = adminRoute<{ id: string }>(async (_req, { params }) => {
	const customer = await getCustomerDetail(params.id);
	if (!customer) throw notFound("Customer");
	return { customer };
});
