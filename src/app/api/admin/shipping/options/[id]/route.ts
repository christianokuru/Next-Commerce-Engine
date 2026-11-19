import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { toggle } from "@/server/admin-schemas";
import { deleteOption, setOptionActive } from "@/modules/shipping/service";

type P = { id: string };
export const PATCH = adminRoute<P>(async (req, { params }) => { await setOptionActive(params.id, (await body(req, toggle)).isActive); return { ok: true }; });
export const DELETE = adminRoute<P>(async (_req, { params }) => { await deleteOption(params.id); return { deleted: true }; });
