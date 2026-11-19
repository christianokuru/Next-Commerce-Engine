export const dynamic = "force-static";
export const metadata = { title: "Offline" };

export default function Offline() {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
			<h1 className="text-xl font-semibold">You&apos;re offline</h1>
			<p className="text-sm text-muted-foreground">Check your connection and try again.</p>
		</main>
	);
}
