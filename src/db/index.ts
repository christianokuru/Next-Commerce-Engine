import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export { schema };
export type Schema = typeof schema;
/** Any Drizzle Postgres database or transaction bound to our schema. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

type Driver = {
	db: () => Db;
	transaction: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;
};

function connectionString() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set");
	return url;
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

let driver: Driver = neonDriver;

/** Swap the driver (used by tests with PGlite). */
export function setDriver(d: Driver) {
	driver = d;
}

export const db = () => driver.db();
export const transaction = <T>(fn: (tx: Db) => Promise<T>) => driver.transaction(fn);
