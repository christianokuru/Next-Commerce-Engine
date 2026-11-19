import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins/bearer";
import { db } from "@/db";
import { user, session, account, verification, rateLimit } from "@/modules/auth/schema";
import { sendEmail } from "@/modules/notification/email";
import { actionEmail } from "@/modules/notification/templates";
import { appUrl, env, requireEnv } from "./env";

function storeName() {
	return env("STORE_NAME") ?? "Store";
}

/** Zero-config local dev: a fixed dev-only secret. Production must set BETTER_AUTH_SECRET. */
function authSecret() {
	const s = env("BETTER_AUTH_SECRET");
	if (s) return s;
	if (process.env.NODE_ENV === "development") return "dev-only-insecure-secret-do-not-use-in-production";
	return requireEnv("BETTER_AUTH_SECRET");
}

function createAuth() {
	const google = env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET");
	return betterAuth({
		appName: storeName(),
		baseURL: appUrl(),
		secret: authSecret(),
		trustedOrigins: [appUrl(), ...(env("TRUSTED_ORIGINS")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])],
		database: drizzleAdapter(db(), {
			provider: "pg",
			schema: { user, session, account, verification, rateLimit },
		}),
		user: {
			additionalFields: {
				// input:false → can never be set by sign-up/update payloads (no privilege escalation).
				role: { type: "string", required: false, defaultValue: "customer", input: false },
			},
		},
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			requireEmailVerification: true,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				await sendEmail({ to: user.email, ...actionEmail(storeName(), "Reset your password", "Click below to choose a new password. The link expires in 1 hour.", url, "Reset password") });
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				await sendEmail({ to: user.email, ...actionEmail(storeName(), "Verify your email", "Confirm your email address to activate your account.", url, "Verify email") });
			},
		},
		socialProviders: google
			? { google: { clientId: env("GOOGLE_CLIENT_ID")!, clientSecret: env("GOOGLE_CLIENT_SECRET")! } }
			: undefined,
		session: {
			expiresIn: 60 * 60 * 24 * 14,
			updateAge: 60 * 60 * 24,
			cookieCache: { enabled: true, maxAge: 60 * 5 },
		},
		rateLimit: {
			enabled: true,
			storage: "database",
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 60, max: 5 },
				"/sign-up/email": { window: 60, max: 3 },
				"/request-password-reset": { window: 300, max: 3 },
				"/send-verification-email": { window: 300, max: 3 },
			},
		},
		advanced: {
			ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
			useSecureCookies: appUrl().startsWith("https://"),
		},
		// bearer(): headless storefronts on another domain can authenticate with `Authorization: Bearer <session token>`.
		plugins: [bearer(), nextCookies()],
	});
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Lazily created so env/bindings are read at request time on Workers. */
export function auth(): Auth {
	instance ??= createAuth();
	return instance;
}

export type SessionUser = Auth["$Infer"]["Session"]["user"];
