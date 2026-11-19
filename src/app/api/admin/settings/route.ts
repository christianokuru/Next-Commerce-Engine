import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { settingsUpdate } from "@/server/admin-schemas";
import { getSettingsUncached, updateSettings } from "@/modules/store/service";

export const GET = adminRoute(async () => ({ settings: await getSettingsUncached() }));
export const PATCH = adminRoute(async (req) => ({ settings: await updateSettings(await body(req, settingsUpdate)) }));
