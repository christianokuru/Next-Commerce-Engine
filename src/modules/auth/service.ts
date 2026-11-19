/**
 * Auth module — admin roles and Admin API keys. (Sessions/passwords are handled by Better Auth in lib/auth.ts.)
 */
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { user, apiKeys } from "./schema";
import { newId, randomToken } from "@/lib/id";
import { toHex } from "@/lib/crypto";
import { CommerceError, notFound } from "@/lib/errors";

export async function getRole(userId: string) {
	const [u] = await db().select({ role: user.role }).from(user).where(eq(user.id, userId));
	return u?.role ?? null;
}

export async function hasAdmin() {
	const [a] = await db().select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
	return Boolean(a);
}

export async function listAdmins() {
	return db().select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, "admin")).orderBy(desc(user.createdAt));
}

export async function adminEmails() {
	return (await listAdmins()).map((a) => a.email);
}

export async function findUserByEmail(email: string) {
	const [u] = await db().select().from(user).where(eq(user.email, email.trim().toLowerCase()));
	return u ?? null;
}

export async function promoteToAdmin(userId: string, opts: { verifyEmail?: boolean } = {}) {
	await db().update(user).set({ role: "admin", ...(opts.verifyEmail ? { emailVerified: true } : {}) }).where(eq(user.id, userId));
}

/** Change a user's role, keeping at least one admin and preventing self-demotion. */
export async function setRole(actorId: string, email: string, role: "admin" | "customer") {
	const target = await findUserByEmail(email);
	if (!target) throw new CommerceError("not_found", "No user with that email. Ask them to sign up first.");
	if (target.id === actorId && role !== "admin") throw new CommerceError("not_allowed", "You cannot remove your own admin access");
	if (role === "customer") {
		const others = await db().select({ id: user.id }).from(user).where(and(eq(user.role, "admin"), ne(user.id, target.id))).limit(1);
		if (!others.length) throw new CommerceError("not_allowed", "At least one admin is required");
	}
	await db().update(user).set({ role }).where(eq(user.id, target.id));
}

// ---------- API keys ----------

const KEY_PREFIX = "nce_sk_";
const sha256 = async (s: string) => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
export const looksLikeApiKey = (s: string) => s.startsWith(KEY_PREFIX) && s.length > 30 && s.length < 100;

/** Returns the plaintext key ONCE; only its hash is stored. */
export async function createApiKey(name: string, createdBy: string) {
	const key = `${KEY_PREFIX}${randomToken(32)}`;
	const id = newId("apik");
	await db().insert(apiKeys).values({ id, name: name.trim().slice(0, 80) || "API key", prefix: key.slice(0, 14), hash: await sha256(key), createdBy });
	return { id, key };
}

export async function listApiKeys() {
	return db().select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt })
		.from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(id: string) {
	const r = await db().update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
	if (!r.length) throw notFound("API key");
}

/** Resolve an active key. Also checks the key's creator is still an admin. */
export async function verifyApiKey(key: string) {
	if (!looksLikeApiKey(key)) return null;
	const [row] = await db().select().from(apiKeys).where(and(eq(apiKeys.hash, await sha256(key)), isNull(apiKeys.revokedAt)));
	if (!row || (await getRole(row.createdBy)) !== "admin") return null;
	if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000)
		await db().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
	return { id: row.id, name: row.name, createdBy: row.createdBy };
}
