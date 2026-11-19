import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRole } from "@/modules/auth/service";
import { getCustomerForUser } from "@/modules/customer/service";
import { CommerceError } from "@/lib/errors";

export const getSession = cache(async () => {
	const h = await headers(); // first: opts the route into dynamic rendering before touching secrets
	return auth().api.getSession({ headers: h });
});

/** Admin paths bypass the 5-minute cookie cache: revoked/expired sessions are rejected immediately. */
const getFreshSession = cache(async () => {
	const h = await headers();
	return auth().api.getSession({ headers: h, query: { disableCookieCache: true } });
});

/** Role is re-read from the DB (not the cookie cache) so demotions apply immediately. */
const freshRole = cache(getRole);

export async function requireAdmin() {
	const s = await getFreshSession();
	if (!s) redirect("/sign-in?next=/admin");
	if ((await freshRole(s.user.id)) !== "admin") redirect("/account");
	return s.user;
}

/** For server actions: throws instead of redirecting. */
export async function assertAdmin() {
	const s = await getFreshSession();
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
