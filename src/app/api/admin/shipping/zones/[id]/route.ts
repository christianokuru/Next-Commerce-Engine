import { adminRoute } from "@/server/admin-api";
import { deleteZone } from "@/modules/shipping/service";

export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => { await deleteZone(params.id); return { deleted: true }; });
