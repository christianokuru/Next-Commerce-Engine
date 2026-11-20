/** Store module — single-row store settings + appearance theme. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storeSettings } from "./schema";
import { cached, invalidate, CacheTags } from "@/lib/cache";
import { resolveTheme } from "./theme";
import { REGION_PRESETS, currentRegion } from "@/lib/plan";

export type StoreSettings = typeof storeSettings.$inferSelect;

export async function getSettingsUncached(): Promise<StoreSettings> {
	const [row] = await db().select().from(storeSettings).where(eq(storeSettings.id, "default"));
	if (row) return row;
	// First run: start from the region preset (currency + payment providers). The admin can change them later.
	const preset = REGION_PRESETS[currentRegion()];
	const [created] = await db()
		.insert(storeSettings)
		.values({ id: "default", defaultCurrency: preset.currency, currencies: [preset.currency], paymentProviders: [...preset.providers] })
		.onConflictDoNothing()
		.returning();
	return created ?? (await db().select().from(storeSettings).where(eq(storeSettings.id, "default")))[0];
}

/** Active dashboard theme (falls back to the default preset). */
export async function getTheme() {
	return resolveTheme((await getSettings()).theme);
}

export async function getSettings(): Promise<StoreSettings> {
	const s = await cached(CacheTags.settings, "store", 300, getSettingsUncached);
	return { ...s, updatedAt: new Date(s.updatedAt) };
}

export type SettingsUpdate = Partial<Omit<StoreSettings, "id" | "updatedAt">>;

export async function updateSettings(input: SettingsUpdate) {
	await getSettingsUncached();
	if (input.currencies) input.currencies = [...new Set(input.currencies.map((c) => c.toUpperCase()))];
	if (input.defaultCurrency) input.defaultCurrency = input.defaultCurrency.toUpperCase();
	const [row] = await db()
		.update(storeSettings)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(storeSettings.id, "default"))
		.returning();
	await invalidate(CacheTags.settings);
	return row;
}
