import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../src/modules");
const files = (dir: string): string[] =>
	readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));

describe("module isolation (Medusa-style)", () => {
	it("modules never import other modules, workflows, queries or app code", () => {
		const violations: string[] = [];
		for (const file of files(root).filter((f) => f.endsWith(".ts"))) {
			const own = path.relative(root, file).split(path.sep)[0];
			for (const [, spec] of readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)) {
				const resolved = spec.startsWith(".") ? path.relative(root, path.resolve(path.dirname(file), spec)) : spec;
				const other = spec.startsWith("@/modules/") ? spec.split("/")[2] : spec.startsWith(".") && !resolved.startsWith("..") ? resolved.split(path.sep)[0] : null;
				if ((other && other !== own) || /^@\/(workflows|queries|app|server|components|subscribers)/.test(spec))
					violations.push(`${path.relative(root, file)} → ${spec}`);
			}
		}
		expect(violations).toEqual([]);
	});

	it("schemas declare no foreign keys to other modules", () => {
		const sql = readFileSync(path.resolve(__dirname, "../drizzle/0000_init.sql"), "utf8");
		const owner: Record<string, string> = {};
		for (const file of files(root).filter((f) => f.endsWith("schema.ts")))
			for (const [, table] of readFileSync(file, "utf8").matchAll(/pgTable\(\s*"([a-z_]+)"/g)) owner[table] = path.relative(root, file).split(path.sep)[0];
		const cross = [...sql.matchAll(/ALTER TABLE "([a-z_]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("[a-z_]+"\) REFERENCES "public"\."([a-z_]+)"/g)]
			.filter(([, from, to]) => owner[from] !== owner[to])
			.map(([, from, to]) => `${from} → ${to}`);
		expect(Object.keys(owner).length).toBeGreaterThan(20);
		expect(cross).toEqual([]);
	});
});
