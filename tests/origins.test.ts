import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb } from "./setup-db";
import { isAllowedRedirect, isCorsOrigin, trustedOrigins } from "@/lib/origins";
import { corsHeaders } from "@/lib/http";
import { updateSettings } from "@/modules/store/service";

const env = process.env as Record<string, string | undefined>;
beforeAll(async () => { await setupTestDb(); });
afterEach(() => { delete env.STORE_CORS; env.NODE_ENV = "test"; });

describe("allowed origins", () => {
	it("CORS: STORE_CORS only (localhost only in development)", () => {
		env.STORE_CORS = "https://shop.test, https://other.test/";
		expect(isCorsOrigin("https://shop.test")).toBe(true);
		expect(isCorsOrigin("https://other.test")).toBe(true);
		expect(isCorsOrigin("https://evil.test")).toBe(false);
		expect(isCorsOrigin("http://localhost:3001")).toBe(false);
		env.NODE_ENV = "development";
		expect(isCorsOrigin("http://localhost:3001")).toBe(true);
		expect(isCorsOrigin("http://localhost.evil.test")).toBe(false);
		const h = corsHeaders(new Request("https://e.test", { headers: { origin: "http://localhost:3001" } }));
		expect(h["Access-Control-Expose-Headers"]).toBe("set-auth-token");
	});

	it("redirects: engine, STORE_CORS and Settings → Storefront URL; nothing else", async () => {
		env.STORE_CORS = "https://shop.test";
		await updateSettings({ storefrontUrl: "https://brand.test/" });
		expect(await trustedOrigins()).toEqual(expect.arrayContaining(["https://shop.test", "https://brand.test"]));
		expect(await isAllowedRedirect("https://shop.test/checkout/complete")).toBe(true);
		expect(await isAllowedRedirect("https://brand.test/x?y=1")).toBe(true);
		expect(await isAllowedRedirect("https://evil.test/phish")).toBe(false);
		expect(await isAllowedRedirect("javascript:alert(1)")).toBe(false);
		expect(await isAllowedRedirect("//evil.test")).toBe(false);
		expect(await isAllowedRedirect("https://shop.test.evil.test/")).toBe(false);
	});
});
