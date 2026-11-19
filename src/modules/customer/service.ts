import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db, type Db } from "@/db";
import { customers, customerAddresses, type Address } from "./schema";
import { newId } from "@/lib/id";
import { notFound } from "@/lib/errors";

export type Customer = typeof customers.$inferSelect;

const norm = (email: string) => email.trim().toLowerCase();

/** Find or create a (guest) customer record by email. */
export async function getOrCreateByEmail(email: string, d: Db = db(), extra: Partial<Customer> = {}) {
	const e = norm(email);
	const [existing] = await d.select().from(customers).where(eq(customers.email, e));
	if (existing) return existing;
	const [created] = await d
		.insert(customers)
		.values({ id: newId("cus"), email: e, firstName: extra.firstName, lastName: extra.lastName, phone: extra.phone })
		.onConflictDoNothing()
		.returning();
	return created ?? (await d.select().from(customers).where(eq(customers.email, e)))[0];
}

/**
 * Customer module — customer profiles and addresses. Linked to auth users by `userId`.
 */

/**
 * Resolve the customer profile for an authenticated user.
 * Guest history with the same email is only linked when the email is VERIFIED,
 * otherwise anyone could register a victim's email and see their orders.
 */
export async function getCustomerForUser(u: { id: string; email: string; name?: string | null; emailVerified: boolean }) {
	const [linked] = await db().select().from(customers).where(eq(customers.userId, u.id));
	if (linked) return linked;
	if (!u.emailVerified) return null;
	const c = await getOrCreateByEmail(u.email, db(), { firstName: u.name?.split(" ")[0] ?? null, lastName: u.name?.split(" ").slice(1).join(" ") || null });
	if (c.userId && c.userId !== u.id) return null;
	const [updated] = await db().update(customers).set({ userId: u.id }).where(eq(customers.id, c.id)).returning();
	return updated;
}

export async function updateCustomer(id: string, input: { firstName?: string | null; lastName?: string | null; phone?: string | null }) {
	const [row] = await db().update(customers).set(input).where(eq(customers.id, id)).returning();
	if (!row) throw notFound("Customer");
	return row;
}

export async function listAddresses(customerId: string) {
	return db().select().from(customerAddresses).where(eq(customerAddresses.customerId, customerId)).orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt));
}

export async function addAddress(customerId: string, address: Address, isDefault = false) {
	const id = newId("addr");
	if (isDefault) await db().update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customerId));
	await db().insert(customerAddresses).values({ id, customerId, address, isDefault });
	return id;
}

/** Scoped by customer to prevent IDOR. */
export async function deleteAddress(customerId: string, addressId: string) {
	await db().delete(customerAddresses).where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)));
}

export async function listCustomers(opts: { q?: string; limit?: number; offset?: number } = {}) {
	const where = opts.q
		? or(ilike(customers.email, `%${opts.q}%`), ilike(customers.firstName, `%${opts.q}%`), ilike(customers.lastName, `%${opts.q}%`))
		: undefined;
	const [rows, [{ total }]] = await Promise.all([
		db()
			.select({
				id: customers.id, email: customers.email, firstName: customers.firstName, lastName: customers.lastName,
				userId: customers.userId, createdAt: customers.createdAt,
			})
			.from(customers)
			.where(where)
			.orderBy(desc(customers.createdAt))
			.limit(Math.min(opts.limit ?? 25, 100))
			.offset(opts.offset ?? 0),
		db().select({ total: count() }).from(customers).where(where),
	]);
	return { customers: rows, count: total };
}

export async function countCustomers() {
	const [{ n }] = await db().select({ n: count() }).from(customers);
	return n;
}

export async function getCustomer(id: string) {
	const c = await db().query.customers.findFirst({ where: eq(customers.id, id), with: { addresses: true } });
	return c ?? null;
}
