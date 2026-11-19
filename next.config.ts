import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	`connect-src 'self'${isDev ? " ws:" : ""}`,
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"object-src 'none'",
	"form-action 'self' https://checkout.paystack.com https://checkout.flutterwave.com https://checkout.stripe.com",
].join("; ");

const securityHeaders = [
	{ key: "Content-Security-Policy", value: csp },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
	{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	// Local-only embedded Postgres used by `npm run dev` when DATABASE_URL is empty.
	serverExternalPackages: ["@electric-sql/pglite"],
	async headers() {
		return [
			{ source: "/:path*", headers: securityHeaders },
			{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
			{ source: "/(admin|account)/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
		];
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
