import { desc, eq, sql } from "drizzle-orm";
/** Promotion module — discount codes. */
import { db, type Db } from "@/db";
import { promotions } from "./schema";
import { newId } from "@/lib/id";
import { CommerceError, invalid } from "@/lib/errors";

export type Promotion = typeof promotions.$inferSelect;
export type PromotionInput = {
	code: string;
	description?: string | null;
	type: Promotion["type"];
	value: number;
	currencyCode?: string | null;
	minSubtotal?: number | null;
	usageLimit?: number | null;
	startsAt?: Date | null;
	endsAt?: Date | null;
	isActive?: boolean;
};

export const normalizeCode = (c: string) => c.trim().toUpperCase();

function validate(input: PromotionInput) {
	if (!/^[A-Z0-9_-]{3,32}$/.test(normalizeCode(input.code))) throw invalid("Code must be 3-32 chars: letters, digits, - or _");
	if (input.type === "percentage" && (input.value < 1 || input.value > 100)) throw invalid("Percentage must be between 1 and 100");
	if (input.type === "fixed") {
		if (!input.currencyCode) throw invalid("Fixed discounts need a currency");
		if (input.value <= 0) throw invalid("Fixed discount must be positive");
	}
	if (input.startsAt && input.endsAt && input.startsAt > input.endsAt) throw invalid("End date must be after start date");
}

export async function createPromotion(input: PromotionInput) {
	validate(input);
	const id = newId("promo");
	try {
		await db().insert(promotions).values({
			...input,
			id,
			code: normalizeCode(input.code),
			value: input.type === "free_shipping" ? 0 : input.value,
			currencyCode: input.type === "fixed" ? input.currencyCode!.toUpperCase() : null,
		});
	} catch (e) {
		if (/unique|duplicate/i.test(String(e) + String((e as { cause?: unknown }).cause))) throw new CommerceError("conflict", "Code already exists");
		throw e;
	}
	return id;
}

export async function setPromotionActive(id: string, isActive: boolean) {
	await db().update(promotions).set({ isActive }).where(eq(promotions.id, id));
}

export async function deletePromotion(id: string) {
	await db().delete(promotions).where(eq(promotions.id, id));
}

export async function listPromotions() {
	return db().select().from(promotions).orderBy(desc(promotions.createdAt));
}

export async function findByCode(code: string, d: Db = db()) {
	const [p] = await d.select().from(promotions).where(eq(promotions.code, normalizeCode(code)));
	return p ?? null;
}

export async function getPromotion(id: string, d: Db = db()) {
	const [p] = await d.select().from(promotions).where(eq(promotions.id, id));
	return p ?? null;
}

/** Usage is counted when an order is placed (inside the order transaction). */
export async function recordUsage(tx: Db, id: string) {
	await tx.update(promotions).set({ usageCount: sql`${promotions.usageCount} + 1` }).where(eq(promotions.id, id));
}
