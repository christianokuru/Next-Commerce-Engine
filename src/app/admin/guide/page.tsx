import { PageHeader } from "@/components/app/ui-bits";
import { visibleGuide } from "@/content/guide";
import { isAvailable, limits } from "@/lib/plan";

export const metadata = { title: "Guide" };
export const dynamic = "force-dynamic";

export default function GuidePage() {
	// Only what this store has: features outside the plan don't appear at all.
	const guide = visibleGuide((f) => isAvailable(f), limits());
	const number = new Map(guide.flatMap((s) => s.entries).map((e, i) => [e.id, i + 1]));
	return (
		<>
			<PageHeader eyebrow="Help" title="Store guide" description="How every part of your store works, step by step." />
			<div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
				<nav aria-label="Contents" className="hidden lg:block">
					<div className="sticky top-6 space-y-5 text-sm">
						{guide.map((s) => (
							<div key={s.title}>
								<p className="eyebrow mb-2">{s.title}</p>
								<ul className="space-y-1.5">
									{s.entries.map((e) => (
										<li key={e.id}><a href={`#${e.id}`} className="text-muted-foreground hover:text-foreground">{e.title}</a></li>
									))}
								</ul>
							</div>
						))}
					</div>
				</nav>

				<div className="min-w-0 space-y-12">
					{guide.map((s) => (
						<section key={s.title}>
							<h2 className="display mb-2 border-b-2 border-rule pb-2 text-2xl sm:text-3xl">{s.title}</h2>
							<div className="divide-y divide-border">
								{s.entries.map((e) => (
									<article key={e.id} id={e.id} className="scroll-mt-6 py-6">
										<div className="flex items-baseline gap-4">
											<span className="numeral text-sm text-brand">{String(number.get(e.id)).padStart(2, "0")}</span>
											<h3 className="font-heading text-xl">{e.title}</h3>
										</div>
										<p className="mt-2 max-w-2xl text-sm leading-relaxed">{e.summary}</p>
										{e.steps && (
											<ol className="mt-4 max-w-2xl space-y-1.5 text-sm text-muted-foreground">
												{e.steps.map((st, i) => <li key={st} className="flex gap-3"><span className="numeral w-4 shrink-0 text-foreground">{i + 1}.</span><span>{st}</span></li>)}
											</ol>
										)}
										{e.tips && (
											<ul className="mt-4 max-w-2xl space-y-1.5 border-l-2 border-brand/60 pl-4 text-sm text-muted-foreground">
												{e.tips.map((t) => <li key={t}>{t}</li>)}
											</ul>
										)}
									</article>
								))}
							</div>
						</section>
					))}
				</div>
			</div>
		</>
	);
}
