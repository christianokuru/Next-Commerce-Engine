import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { settingsUpdate } from "@/server/admin-schemas";
import { getSettingsUncached } from "@/modules/store/service";
import { updateStoreSettings } from "@/workflows/store";

export const GET = adminRoute(async () => ({ settings: await getSettingsUncached() }));
export const PATCH = adminRoute(async (req) => ({ settings: await updateStoreSettings(await body(req, settingsUpdate)) }));
