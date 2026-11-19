import { adminRoute, actorId } from "@/server/admin-api";
import { body } from "@/lib/http";
import { note } from "@/server/admin-schemas";
import { addOrderNote } from "@/modules/order/service";

export const POST = adminRoute<{ id: string }>(async (req, { params, actor }) => {
	await addOrderNote(params.id, (await body(req, note)).note, actorId(actor));
	return { ok: true };
});
