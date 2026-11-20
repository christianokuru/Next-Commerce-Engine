import { route, preflight } from "@/lib/http";
import { currentRegion, features } from "@/lib/plan";

/** What this store supports, so a custom storefront can hide sign-in, the discount box, etc. automatically. */
export const OPTIONS = preflight;
export const GET = route(async () => ({ region: currentRegion(), features: features() }));
