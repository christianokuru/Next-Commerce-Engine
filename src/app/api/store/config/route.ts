import { route, preflight } from "@/lib/http";
import { availableFeatures, currentRegion } from "@/lib/plan";

/** Features this store has (only those switched on), so a custom storefront can show sign-in, a discount box, etc. */
export const OPTIONS = preflight;
export const GET = route(async () => ({ region: currentRegion(), features: availableFeatures() }));
