import { ThemeStyle } from "@/components/app/theme-style";
import { getSettings } from "@/modules/store/service";
import { isDark, resolveTheme } from "@/modules/store/theme";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const settings = await getSettings().catch(() => null);
	const theme = resolveTheme(settings?.theme);
	return (
		<>
			<ThemeStyle theme={theme} />
			<main data-surface="cards" {...(isDark(theme) ? { "data-theme-dark": "" } : {})} className="flex min-h-dvh items-start justify-center bg-background px-4 py-12 sm:items-center">
				<div className="w-full max-w-sm">
					<p className="display mb-6 text-center text-3xl">{settings?.name ?? "Commerce"}</p>
					{children}
				</div>
			</main>
		</>
	);
}
