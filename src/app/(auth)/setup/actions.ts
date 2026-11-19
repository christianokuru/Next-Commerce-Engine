"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user } from "@/modules/auth/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { email } from "@/lib/validators";
import { formObject, toActionError, type ActionState } from "@/lib/action";

export async function hasAdmin() {
	const [a] = await db().select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
	return Boolean(a);
}

const schema = z.object({
	token: z.string().min(1),
	name: z.string().trim().min(1).max(100),
	email,
	password: z.string().min(10, "Use at least 10 characters for the admin password").max(128),
});

/** One-time bootstrap of the first admin. Requires SETUP_TOKEN and is disabled once any admin exists. */
export async function createFirstAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
	try {
		const expected = env("SETUP_TOKEN");
		if (!expected) return { ok: false, error: "SETUP_TOKEN is not configured on the server" };
		const input = schema.parse(formObject(fd));
		if (!safeEqual(input.token, expected)) return { ok: false, error: "Invalid setup token" };
		if (await hasAdmin()) return { ok: false, error: "Setup has already been completed" };

		const [existing] = await db().select().from(user).where(eq(user.email, input.email));
		const userId = existing?.id ?? (await auth().api.signUpEmail({ body: { name: input.name, email: input.email, password: input.password } })).user.id;
		await db().update(user).set({ role: "admin", emailVerified: true }).where(eq(user.id, userId));
	} catch (e) {
		return toActionError(e);
	}
	redirect("/sign-in?next=/admin");
}
