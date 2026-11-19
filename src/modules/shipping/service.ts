import { and, asc, eq, sql } from "drizzle-orm";
/** Shipping module — zones (countries) and rates. */
import { db, type Db } from "@/db";
import { shippingOptions, shippingZones } from "./schema";
import { newId } from "@/lib/id";
import { invalid } from "@/lib/errors";

export type ShippingOption = typeof shippingOptions.$inferSelect;

const normCountries = (c: string[]) => [...new Set(c.map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)))];

export async function listZones() {
	return db().query.shippingZones.findMany({ orderBy: asc(shippingZones.name), with: { options: { orderBy: asc(shippingOptions.amount) } } });
}

export async function createZone(input: { name: string; countries: string[] }) {
	const countries = normCountries(input.countries);
	if (!countries.length) throw invalid("At least one valid ISO country code is required");
	const id = newId("szone");
	await db().insert(shippingZones).values({ id, name: input.name.trim(), countries });
	return id;
}

export async function deleteZone(id: string) {
	await db().delete(shippingZones).where(eq(shippingZones.id, id));
}

export async function createOption(input: {
	zoneId: string; name: string; currencyCode: string; amount: number; freeOverAmount?: number | null;
	minDeliveryDays?: number | null; maxDeliveryDays?: number | null;
}) {
	if (!Number.isInteger(input.amount) || input.amount < 0) throw invalid("Invalid amount");
	const id = newId("so");
	await db().insert(shippingOptions).values({ ...input, id, currencyCode: input.currencyCode.toUpperCase() });
	return id;
}

export async function setOptionActive(id: string, isActive: boolean) {
	await db().update(shippingOptions).set({ isActive }).where(eq(shippingOptions.id, id));
}

export async function getOption(id: string, d: Db = db()) {
	const [o] = await d.select().from(shippingOptions).where(eq(shippingOptions.id, id));
	return o ?? null;
}

export async function deleteOption(id: string) {
	await db().delete(shippingOptions).where(eq(shippingOptions.id, id));
}

/** Options available for a destination country and currency. */
export async function optionsFor(countryCode: string, currency: string, d: Db = db()) {
	return d
		.select({
			id: shippingOptions.id, name: shippingOptions.name, amount: shippingOptions.amount,
			freeOverAmount: shippingOptions.freeOverAmount, currencyCode: shippingOptions.currencyCode,
			minDeliveryDays: shippingOptions.minDeliveryDays, maxDeliveryDays: shippingOptions.maxDeliveryDays,
		})
		.from(shippingOptions)
		.innerJoin(shippingZones, eq(shippingZones.id, shippingOptions.zoneId))
		.where(
			and(
				eq(shippingOptions.isActive, true),
				eq(shippingOptions.currencyCode, currency.toUpperCase()),
				sql`${countryCode.toUpperCase()} = any(${shippingZones.countries})`,
			),
		)
		.orderBy(asc(shippingOptions.amount));
}
