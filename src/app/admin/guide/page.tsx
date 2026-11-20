import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/app/ui-bits";
import { UpgradeContact } from "@/components/app/plan";
import { GUIDE, type GuideEntry } from "@/content/guide";
import { FEATURES, currentPlan, hasFeature, isSoon, planName } from "@/lib/plan";
import { cn } from "@/lib/utils";

export const metadata = { title: "Guide" };
export const dynamic = "force-dynamic";

function Status({ e }: { e: GuideEntry }) {
	if (!e.feature) return null;
	const soon = isSoon(e.feature);
	if (hasFeature(e.feature)) return soon ? <span className="eyebrow">Coming soon</span> : <span className="eyebrow text-brand">Included</span>;
	return (
		<span className="eyebrow inline-flex items-center gap-1">
			<Lock className="size-3" /> {planName(FEATURES[e.feature].minPlan)}{soon ? " · soon" : ""}
		</span>
	);
}

// Running number across sections, computed up front (no mutation during render).
const NUMBER = new Map(GUIDE.flatMap((s) => s.entries).map((e, i) => [e.id, i + 1]));

export default function GuidePage() {
	return (
		<>
			<PageHeader eyebrow="Help" title="Store guide" description={`How every part of your store works. You're on the ${planName(currentPlan())} plan; features marked with a lock are available on higher plans.`} />
			<div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
				<nav aria-label="Contents" className="hidden lg:block">
					<div className="sticky top-6 space-y-5 text-sm">
						{GUIDE.map((s) => (
							<div key={s.title}>
								<p className="eyebrow mb-2">{s.title}</p>
								<ul className="space-y-1.5">
									{s.entries.map((e) => (
										<li key={e.id}>
											<a href={`#${e.id}`} className={cn("hover:text-foreground", e.feature && !hasFeature(e.feature) ? "text-muted-foreground/70" : "text-muted-foreground")}>{e.title}</a>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</nav>

				<div className="min-w-0 space-y-12">
					{GUIDE.map((s) => (
						<section key={s.title}>
							<h2 className="display mb-2 border-b-2 border-rule pb-2 text-2xl sm:text-3xl">{s.title}</h2>
							<div className="divide-y divide-border">
								{s.entries.map((e) => {
									const locked = Boolean(e.feature && !hasFeature(e.feature));
									return (
										<article key={e.id} id={e.id} className="scroll-mt-6 py-6">
											<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
												<span className="numeral text-sm text-brand">{String(NUMBER.get(e.id)).padStart(2, "0")}</span>
												<h3 className={cn("font-heading text-xl", locked && "text-muted-foreground")}>{e.title}</h3>
												<span className="ml-auto"><Status e={e} /></span>
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
									);
								})}
							</div>
						</section>
					))}
					<footer className="border-t-2 border-rule pt-6">
						<p className="text-sm">Need something that isn&rsquo;t in your plan? <Link className="underline" href="/admin/settings#plan">Compare plans</Link></p>
						<UpgradeContact className="mt-1" />
					</footer>
				</div>
			</div>
		</>
	);
}
