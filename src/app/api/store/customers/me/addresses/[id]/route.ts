import { route, preflight } from "@/lib/http";
import { requireStoreCustomer } from "@/server/store-api";
import { deleteAddress } from "@/modules/customer/service";

export const OPTIONS = preflight;
export const DELETE = route<{ id: string }>(async (req, { id }) => {
	await deleteAddress((await requireStoreCustomer(req)).id, id);
	return { deleted: true };
});
