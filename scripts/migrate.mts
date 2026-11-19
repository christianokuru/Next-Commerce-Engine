/**
 * Apply Drizzle migrations to Neon over HTTPS (no TCP 5432 needed).
 * Usage: DATABASE_URL=... npm run db:migrate
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
await migrate(drizzle(neon(url)), { migrationsFolder: "./drizzle" });
console.log("Migrations applied");
