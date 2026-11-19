import { readFileSync, readdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { schema, setDriver, type Db } from "@/db";

/**
 * In-process Postgres with the real migrations applied.
 * PGlite has a single connection, so while a transaction is open any `db()` call made from
 * inside it is routed to the transaction (in production those go to separate Neon connections).
 */
export async function setupTestDb() {
	if (process.env.TEST_DATABASE_URL) {
		// Integration mode: real Neon (HTTP for queries, WebSocket Pool for transactions). DB must be migrated.
		process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
		const { db } = await import("@/db");
		await db().execute(sql`truncate table webhook_events, refunds, payments, order_events, order_line_items, orders, cart_line_items, carts, promotions, shipping_options, shipping_zones, inventory_movements, inventory_items, product_variant_prices, product_variants, product_images, product_options, product_category_links, products, customers, store_settings, api_keys cascade`);
		return { client: null, db: db() };
	}
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
