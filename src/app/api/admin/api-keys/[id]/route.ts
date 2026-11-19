import { adminRoute } from "@/server/admin-api";
import { revokeApiKey } from "@/modules/auth/service";

export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => { await revokeApiKey(params.id); return { revoked: true }; }, { sessionOnly: true });
