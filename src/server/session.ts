import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable } from "@/modules/auth/schema";
import { getCustomerForUser } from "@/modules/customer/service";
import { CommerceError } from "@/lib/errors";

export const getSession = cache(async () => {
	return auth().api.getSession({ headers: await headers() });
});

/** Role is re-read from the DB (not the cookie cache) so demotions apply immediately. */
const freshRole = cache(async (userId: string) => {
	const [u] = await db().select({ role: userTable.role }).from(userTable).where(eq(userTable.id, userId));
	return u?.role ?? null;
});

export async function requireAdmin() {
	const s = await getSession();
	if (!s) redirect("/sign-in?next=/admin");
	if ((await freshRole(s.user.id)) !== "admin") redirect("/account");
	return s.user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertAdmin() {
	const s = await getSession();
	if (!s) throw new CommerceError("unauthorized", "Sign in required");
	if ((await freshRole(s.user.id)) !== "admin") throw new CommerceError("forbidden", "Admin access required");
	return s.user;
}

export async function requireCustomer() {
	const s = await getSession();
	if (!s) redirect("/sign-in?next=/account");
	const customer = await getCustomerForUser(s.user);
	if (!customer) redirect("/verify-email");
	return { user: s.user, customer };
}
