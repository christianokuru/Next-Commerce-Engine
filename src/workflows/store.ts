/** Store-level workflows that apply plan & region rules on top of the store and auth modules. */
import * as authModule from "@/modules/auth/service";
import { updateSettings, type SettingsUpdate } from "@/modules/store/service";
import { CommerceError } from "@/lib/errors";
import { allowedProviders, hasFeature, limits } from "@/lib/plan";

/** Settings update with plan rules: one currency below Advanced; only the region's payment providers. */
export async function updateStoreSettings(input: SettingsUpdate) {
	const next = { ...input };
	if (!hasFeature("multiCurrency") && (next.currencies || next.defaultCurrency)) {
		const base = next.defaultCurrency ?? next.currencies?.[0];
		if (next.currencies && next.currencies.length > 1 && !next.defaultCurrency) next.defaultCurrency = base;
		next.currencies = base ? [base] : next.currencies;
	}
	if (next.paymentProviders) {
		const allowed = allowedProviders();
		const blocked = next.paymentProviders.filter((p) => !allowed.includes(p));
		if (blocked.length) throw new CommerceError("not_allowed", `${blocked.join(", ")} is not available for this store.`);
	}
	return updateSettings(next);
}

/** Grant/remove admin access, respecting the plan's staff limit. */
export async function setStaffRole(actorId: string, email: string, role: "admin" | "customer") {
	if (role === "admin") {
		const max = limits().staff;
		const admins = await authModule.listAdmins();
		if (Number.isFinite(max) && admins.length >= max && !admins.some((a) => a.email.toLowerCase() === email.toLowerCase()))
			throw new CommerceError("plan_required", `Your plan includes ${max} staff account${max === 1 ? "" : "s"}.`, { limit: "staff" });
	}
	await authModule.setRole(actorId, email, role);
}
