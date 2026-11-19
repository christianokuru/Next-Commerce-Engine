"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { findUserByEmail, hasAdmin as anyAdmin, promoteToAdmin } from "@/modules/auth/service";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { email } from "@/lib/validators";
import { formObject, toActionError, type ActionState } from "@/lib/action";

export async function hasAdmin() {
	return anyAdmin();
}

/** Local dev needs no token; production requires SETUP_TOKEN. */
export async function setupTokenRequired() {
	return process.env.NODE_ENV !== "development" || Boolean(env("SETUP_TOKEN"));
}

const schema = z.object({
	token: z.string().optional(),
	name: z.string().trim().min(1).max(100),
	email,
	password: z.string().min(10, "Use at least 10 characters for the admin password").max(128),
});

/** One-time bootstrap of the first admin. Requires SETUP_TOKEN and is disabled once any admin exists. */
export async function createFirstAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
	try {
		const input = schema.parse(formObject(fd));
		if (await setupTokenRequired()) {
			const expected = env("SETUP_TOKEN");
			if (!expected) return { ok: false, error: "SETUP_TOKEN is not configured on the server" };
			if (!safeEqual(input.token ?? "", expected)) return { ok: false, error: "Invalid setup token" };
		}
		if (await hasAdmin()) return { ok: false, error: "Setup has already been completed" };
		const existing = await findUserByEmail(input.email);
		const userId = existing?.id ?? (await auth().api.signUpEmail({ body: { name: input.name, email: input.email, password: input.password } })).user.id;
		await promoteToAdmin(userId, { verifyEmail: true });
	} catch (e) {
		return toActionError(e);
	}
	redirect("/sign-in?next=/admin");
}
