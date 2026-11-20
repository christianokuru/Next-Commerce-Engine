/**
 * `npm run dev` bootstrap (Node only, never bundled for Workers):
 *  - DATABASE_URL set   → apply pending migrations to that database (Neon)
 *  - DATABASE_URL empty → run an embedded Postgres (PGlite) persisted in ./.data/pglite
 */
import path from "node:path";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { schema, setDriver, type Db } from "./index";
import { env } from "@/lib/env";

export async function setupDevDatabase() {
	const migrationsFolder = path.join(process.cwd(), "drizzle");
	const url = env("DATABASE_URL");
	if (url && !/neon\.tech|neon\.build/.test(url)) {
		console.warn("▲ commerce: DATABASE_URL is not a Neon URL, ignoring it and using the local database.");
	} else if (url) {
		const { neon } = await import("@neondatabase/serverless");
		const { drizzle } = await import("drizzle-orm/neon-http");
		const { migrate } = await import("drizzle-orm/neon-http/migrator");
		try {
			await migrate(drizzle(neon(url)), { migrationsFolder });
		} catch (e) {
			throw new Error(
				`Could not connect to DATABASE_URL (${(e as Error).message}). ` +
					"Fix the Neon URL in .env.local, or delete that line to use the built-in local database.",
			);
		}
		console.log("▲ commerce: migrations applied to DATABASE_URL");
		return;
	}
	const { PGlite } = await import("@electric-sql/pglite");
	const { drizzle } = await import("drizzle-orm/pglite");
	const { migrate } = await import("drizzle-orm/pglite/migrator");
	const dataDir = path.join(process.cwd(), ".data", "pglite");

	const open = async () => {
		mkdirSync(dataDir, { recursive: true });
		const client = new PGlite(dataDir);
		try {
			const d = drizzle({ client, schema });
			await migrate(d, { migrationsFolder });
			return d;
		} catch (e) {
			await client.close().catch(() => {});
			throw e;
		}
	};

	let d: Awaited<ReturnType<typeof open>>;
	try {
		d = await open();
	} catch (e) {
		if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) throw e;
		// Usually a half-created database from an interrupted first run: set it aside (not deleted) and start fresh.
		const backup = `${dataDir}-broken-${Date.now()}`;
		console.warn(`▲ commerce: local database failed to open (${(e as Error).message}). Moved it to ${backup} and starting fresh.`);
		renameSync(dataDir, backup);
		d = await open();
	}

	// Single connection: while a transaction is open, route db() calls made inside it to the transaction.
	const als = new AsyncLocalStorage<Db>();
	setDriver({
		db: () => als.getStore() ?? (d as unknown as Db),
		transaction: (fn) => d.transaction((tx) => als.run(tx as unknown as Db, () => fn(tx as unknown as Db))),
	});
	console.log("▲ commerce: using local embedded Postgres (.data/pglite). Set DATABASE_URL to use Neon.");
}
