export async function register() {
	// Zero-config local development. Statically removed from production builds.
	if (process.env.NODE_ENV === "development" && process.env.NEXT_RUNTIME === "nodejs") {
		try {
			const { setupDevDatabase } = await import("./db/dev");
			await setupDevDatabase();
			const { enableTestPayments } = await import("./dev/test-payments");
			enableTestPayments();
		} catch (e) {
			// Keep the server up so pages show the real cause instead of a generic DATABASE_URL error.
			(globalThis as { __nceDevDbError?: string }).__nceDevDbError = (e as Error)?.stack ?? String(e);
			console.error("▲ commerce: local database failed to start:\n", e);
		}
	}
}
