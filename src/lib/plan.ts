/**
 * Tiers & regions. Set per client at deploy time (wrangler vars), never from the dashboard:
 *   PLAN   = starter | standard | advanced | multivendor
 *   REGION = africa | international
 * This file is the single source of truth for what each tier includes.
 */
import { CommerceError } from "./errors";
import { env } from "./env";

export const PLANS = ["starter", "standard", "advanced", "multivendor"] as const;
export type Plan = (typeof PLANS)[number];

export const REGIONS = ["africa", "international"] as const;
export type Region = (typeof REGIONS)[number];

export const FEATURES = {
	customerAccounts: { label: "Customer accounts", minPlan: "standard" },
	discounts: { label: "Discount codes", minPlan: "standard" },
	inventoryTracking: { label: "Stock tracking", minPlan: "standard" },
	collections: { label: "Collections", minPlan: "standard" },
	apiKeys: { label: "API keys", minPlan: "standard" },
	advancedPromotions: { label: "Advanced promotions", minPlan: "advanced", soon: true },
	multiCurrency: { label: "Multiple currencies", minPlan: "advanced" },
	logistics: { label: "Delivery integration", minPlan: "advanced", soon: true },
	reviews: { label: "Product reviews", minPlan: "advanced", soon: true },
	analytics: { label: "Analytics", minPlan: "advanced", soon: true },
	multiVendor: { label: "Multi-vendor marketplace", minPlan: "multivendor", soon: true },
} as const satisfies Record<string, { label: string; minPlan: Plan; soon?: true }>;
export type Feature = keyof typeof FEATURES;

export const PLAN_INFO: Record<Plan, { name: string; tagline: string; limits: { products: number; staff: number } }> = {
	starter: { name: "Starter", tagline: "A simple, fast shop to start selling", limits: { products: 50, staff: 1 } },
	standard: { name: "Standard", tagline: "Everything a growing store needs", limits: { products: Infinity, staff: 3 } },
	advanced: { name: "Advanced", tagline: "For established brands selling at scale", limits: { products: Infinity, staff: 10 } },
	multivendor: { name: "Multi-vendor", tagline: "A marketplace for many sellers", limits: { products: Infinity, staff: Infinity } },
};

export const rank = (p: Plan) => PLANS.indexOf(p);

/** Current tier. Unset → "advanced" in dev/test (try everything), "starter" in production (never give features away by accident). */
export function currentPlan(): Plan {
	const v = env("PLAN")?.toLowerCase();
	if ((PLANS as readonly string[]).includes(v ?? "")) return v as Plan;
	return process.env.NODE_ENV === "production" ? "starter" : "advanced";
}

export function currentRegion(): Region {
	return env("REGION")?.toLowerCase() === "international" ? "international" : "africa";
}

export const hasFeature = (f: Feature, plan: Plan = currentPlan()) => rank(plan) >= rank(FEATURES[f].minPlan);
export const limits = (plan: Plan = currentPlan()) => PLAN_INFO[plan].limits;
export const planName = (p: Plan) => PLAN_INFO[p].name;
/** Feature switch exists but the feature itself isn't built yet. */
export const isSoon = (f: Feature) => "soon" in FEATURES[f];

export function features(plan: Plan = currentPlan()) {
	return Object.fromEntries(Object.keys(FEATURES).map((f) => [f, hasFeature(f as Feature, plan)])) as Record<Feature, boolean>;
}

/** Server-side gate: throws a 403 with a friendly upgrade message. */
export function requireFeature(f: Feature) {
	if (!hasFeature(f)) {
		const { label, minPlan } = FEATURES[f];
		throw new CommerceError("plan_required", `${label} is available on the ${planName(minPlan)} plan and above.`, { feature: f, requiredPlan: minPlan });
	}
}

export function nextPlan(plan: Plan = currentPlan()): Plan | null {
	return PLANS[rank(plan) + 1] ?? null;
}

/** Who the store owner contacts to upgrade (email, phone, WhatsApp or URL). */
export const upgradeContact = () => env("UPGRADE_CONTACT") ?? null;

// ---------- Regions ----------

export const REGION_PRESETS = {
	africa: { name: "Africa", currency: "NGN", providers: ["paystack", "flutterwave"], country: "NG" },
	international: { name: "International", currency: "USD", providers: ["stripe"], country: "US" },
} as const satisfies Record<Region, { name: string; currency: string; providers: readonly string[]; country: string }>;

/** Payment providers this store may offer: region default, or ALLOWED_PAYMENT_PROVIDERS (e.g. "paystack,stripe"). */
export function allowedProviders(): string[] {
	const override = env("ALLOWED_PAYMENT_PROVIDERS")?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
	return override?.length ? override : [...REGION_PRESETS[currentRegion()].providers];
}
