import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env, requireEnv } from "@/lib/env";

export { schema };
export type Schema = typeof schema;
/** Any Drizzle Postgres database or transaction bound to our schema. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

type Driver = {
	db: () => Db;
	transaction: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;
};

function connectionString() {
	const err = (globalThis as { __nceDevDbError?: string }).__nceDevDbError;
	if (process.env.NODE_ENV === "development") {
		if (err) throw new Error(`Local database failed to start. Cause:\n${err}`);
		if (!env("DATABASE_URL"))
			throw new Error("Local database is not ready. Restart `npm run dev` and check the terminal for a line starting with ▲ commerce.");
	}
	return requireEnv("DATABASE_URL");
}

/**
 * Production driver for Cloudflare Workers:
 * - Regular queries go over Neon's HTTP endpoint (stateless fetch → safe to reuse across requests).
 * - Interactive transactions open a short-lived WebSocket Pool *per call* and close it afterwards,
 *   because Workers forbid sharing I/O objects (sockets) between requests.
 */
let httpDb: Db | undefined;
const neonDriver: Driver = {
	db() {
		httpDb ??= drizzleHttp(neon(connectionString()), { schema }) as unknown as Db;
		return httpDb;
	},
	async transaction(fn) {
		const pool = new Pool({ connectionString: connectionString(), max: 1 });
		// Without a listener, a socket closing after pool.end() surfaces as an uncaught error on Workers.
		let ended = false;
		pool.on("error", (e: Error) => {
			if (!ended) console.warn("neon pool error", e.message);
		});
		try {
			const wsDb = drizzleWs({ client: pool, schema });
			return await wsDb.transaction((tx) => fn(tx as unknown as Db));
		} finally {
			ended = true;
			await pool.end().catch(() => {});
		}
	},
};

// Stored on globalThis so the dev driver set in instrumentation is shared by every route bundle.
const g = globalThis as { __nceDbDriver?: Driver };

/** Swap the driver (local PGlite in `next dev`, tests). */
export function setDriver(d: Driver) {
	g.__nceDbDriver = d;
}

const driver = () => g.__nceDbDriver ?? neonDriver;
export const db = () => driver().db();
export const transaction = <T>(fn: (tx: Db) => Promise<T>) => driver().transaction(fn);

/** Run `fn` in the caller's transaction if one is given, otherwise in a new one. Lets services compose inside workflows. */
export function inTx<T>(tx: Db | undefined, fn: (tx: Db) => Promise<T>): Promise<T> {
	return tx ? fn(tx) : transaction(fn);
}
