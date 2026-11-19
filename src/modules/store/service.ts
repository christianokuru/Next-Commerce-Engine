import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storeSettings } from "./schema";
import { cached, invalidate, CacheTags } from "@/lib/cache";

export type StoreSettings = typeof storeSettings.$inferSelect;

export async function getSettingsUncached(): Promise<StoreSettings> {
	const [row] = await db().select().from(storeSettings).where(eq(storeSettings.id, "default"));
	if (row) return row;
	const [created] = await db().insert(storeSettings).values({ id: "default" }).onConflictDoNothing().returning();
	return created ?? (await db().select().from(storeSettings).where(eq(storeSettings.id, "default")))[0];
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
