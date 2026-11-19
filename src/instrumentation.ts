export async function register() {
	// Zero-config local development. Statically removed from production builds.
	if (process.env.NODE_ENV === "development" && process.env.NEXT_RUNTIME === "nodejs") {
		const { setupDevDatabase } = await import("./db/dev");
		await setupDevDatabase();
	}
}
