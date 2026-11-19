/**
 * `npm run dev` bootstrap (Node only, never bundled for Workers):
 *  - DATABASE_URL set   → apply pending migrations to that database (Neon)
 *  - DATABASE_URL empty → run an embedded Postgres (PGlite) persisted in ./.data/pglite
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { schema, setDriver, type Db } from "./index";

export async function setupDevDatabase() {
	const migrationsFolder = path.join(process.cwd(), "drizzle");
	if (process.env.DATABASE_URL) {
		const { neon } = await import("@neondatabase/serverless");
		const { drizzle } = await import("drizzle-orm/neon-http");
		const { migrate } = await import("drizzle-orm/neon-http/migrator");
		await migrate(drizzle(neon(process.env.DATABASE_URL)), { migrationsFolder });
		console.log("▲ commerce: migrations applied to DATABASE_URL");
		return;
	}
	const { PGlite } = await import("@electric-sql/pglite");
	const { drizzle } = await import("drizzle-orm/pglite");
	const { migrate } = await import("drizzle-orm/pglite/migrator");
	const dataDir = path.join(process.cwd(), ".data", "pglite");
	mkdirSync(dataDir, { recursive: true });
	const client = new PGlite(dataDir);
	const d = drizzle({ client, schema });
	await migrate(d, { migrationsFolder });
	// Single connection: while a transaction is open, route db() calls made inside it to the transaction.
	const als = new AsyncLocalStorage<Db>();
	setDriver({
		db: () => als.getStore() ?? (d as unknown as Db),
		transaction: (fn) => d.transaction((tx) => als.run(tx as unknown as Db, () => fn(tx as unknown as Db))),
	});
	console.log("▲ commerce: using local embedded Postgres (.data/pglite). Set DATABASE_URL to use Neon.");
}
