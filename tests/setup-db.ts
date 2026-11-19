import { readFileSync, readdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { schema, setDriver, type Db } from "@/db";

/**
 * In-process Postgres with the real migrations applied.
 * PGlite has a single connection, so while a transaction is open any `db()` call made from
 * inside it is routed to the transaction (in production those go to separate Neon connections).
 */
export async function setupTestDb() {
	const client = new PGlite();
	const dir = path.resolve(__dirname, "../drizzle");
	for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
		for (const stmt of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) {
			if (stmt.trim()) await client.exec(stmt);
		}
	}
	const d = drizzle({ client, schema }) as unknown as Db;
	const als = new AsyncLocalStorage<Db>();
	setDriver({
		db: () => als.getStore() ?? d,
		transaction: (fn) =>
			(d as unknown as { transaction: <T>(f: (tx: Db) => Promise<T>) => Promise<T> }).transaction((tx) => als.run(tx, () => fn(tx))),
	});
	return { client, db: d };
}
