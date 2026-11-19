import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { optionsPut } from "@/server/admin-schemas";
import { setProductOptions } from "@/modules/product/service";

export const PUT = adminRoute<{ id: string }>(async (req, { params }) => {
	await setProductOptions(params.id, (await body(req, optionsPut)).options);
	return { ok: true };
});
