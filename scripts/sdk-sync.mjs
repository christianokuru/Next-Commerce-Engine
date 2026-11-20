// Build the SDK and copy it into a storefront: npm run sdk:sync -- ../storefront-starter
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !existsSync(path.join(target, "package.json"))) {
	console.error("Usage: npm run sdk:sync -- <path-to-storefront>");
	process.exit(1);
}
execSync("npx tsc -p packages/sdk", { stdio: "inherit" });
const dest = path.join(target, "vendor", "commerce-sdk");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of ["package.json", "README.md", "dist"]) if (existsSync(path.join("packages/sdk", f))) cpSync(path.join("packages/sdk", f), path.join(dest, f), { recursive: true });
console.log(`SDK copied to ${dest}. In the storefront: npm install`);
