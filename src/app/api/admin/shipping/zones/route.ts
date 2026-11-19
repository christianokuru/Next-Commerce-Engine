import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { zoneCreate } from "@/server/admin-schemas";
import { createZone, listZones } from "@/modules/shipping/service";

export const GET = adminRoute(async () => ({ zones: await listZones() }));
export const POST = adminRoute(async (req) => ({ id: await createZone(await body(req, zoneCreate)) }));
