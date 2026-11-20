import { ThemeStyle } from "@/components/app/theme-style";
import { getSettings } from "@/modules/store/service";
import { isDark, resolveTheme } from "@/modules/store/theme";

export const dynamic = "force-dynamic";

const CONTENTS = [
	["01", "Catalogue", "Products, variants & collections"],
	["02", "Orders", "From checkout to doorstep"],
	["03", "Payments", "Paystack, Flutterwave & Stripe"],
	["04", "Customers", "Accounts, addresses & history"],
] as const;

function issueNumber(d: Date) {
	return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const settings = await getSettings().catch(() => null);
	const theme = resolveTheme(settings?.theme);
	const name = settings?.name ?? "Commerce";
	const now = new Date();
	const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

	return (
		<>
			<ThemeStyle theme={theme} />
			<div
				data-surface="rules"
				{...(isDark(theme) ? { "data-theme-dark": "" } : {})}
				className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[1.1fr_1fr]"
			>
				{/* Front page — compact masthead on mobile, full cover on desktop */}
				<aside className="relative overflow-hidden bg-foreground text-background">
					<span
						aria-hidden
						className="display pointer-events-none absolute -right-28 -bottom-28 hidden select-none text-[22rem] leading-none text-brand italic opacity-90 lg:block xl:text-[28rem]"
					>
						&amp;
					</span>
					<div className="relative flex h-full flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-12">
						<div className="flex items-center justify-between gap-4 border-b border-background/25 pb-3 text-[0.6875rem] tracking-[0.16em] uppercase opacity-70">
							<span>Back office</span>
							<span className="hidden sm:inline">{date}</span>
							<span>No. {issueNumber(now)}</span>
						</div>

						<div className="pt-6 pb-1 lg:my-auto lg:py-0">
							<p className="text-[0.6875rem] tracking-[0.16em] text-brand uppercase lg:mb-4">The {now.getFullYear()} edition</p>
							<h1 className="display text-5xl break-words sm:text-6xl lg:text-7xl xl:text-8xl">{name}</h1>
							<p className="mt-4 hidden max-w-md font-heading text-xl leading-snug italic opacity-80 lg:block">
								Orders, stock and payments, set in one quiet column. Everything the shop needs, nothing it doesn&rsquo;t.
							</p>
						</div>

						<ol className="relative z-10 hidden max-w-md border-t border-background/60 lg:block">
							{CONTENTS.map(([n, title, sub]) => (
								<li key={n} className="flex items-baseline gap-4 border-b border-background/15 py-3">
									<span className="numeral w-6 text-sm text-brand">{n}</span>
									<span className="font-heading text-lg">{title}</span>
									<span className="ml-auto text-right text-xs opacity-60">{sub}</span>
								</li>
							))}
						</ol>
					</div>
				</aside>

				{/* The form column */}
				<main className="flex items-start justify-center px-5 py-10 sm:px-10 lg:items-center lg:py-16">
					<div className="w-full max-w-sm [&_[data-slot=card-title]]:display [&_[data-slot=card-title]]:text-3xl! [&_[data-slot=card]]:border-t-2">
						{children}
						<p className="eyebrow mt-10 flex items-center gap-3 before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
							Private access
						</p>
					</div>
				</main>
			</div>
		</>
	);
}
