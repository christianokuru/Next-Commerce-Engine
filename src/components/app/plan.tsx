import Link from "next/link";
import { Check, Lock, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/ui-bits";
import { guideEntry } from "@/content/guide";
import { FEATURES, PLAN_INFO, currentPlan, hasFeature, isSoon, limits, nextPlan, planName, upgradeContact, type Feature } from "@/lib/plan";
import { cn } from "@/lib/utils";

/** Email → mailto, phone → WhatsApp, URL → link. */
function contactHref(c: string) {
	if (c.includes("@")) return `mailto:${c}`;
	if (/^\+?[\d\s-]{7,}$/.test(c)) return `https://wa.me/${c.replace(/\D/g, "")}`;
	return /^https?:\/\//.test(c) ? c : `https://${c}`;
}

export function UpgradeContact({ className }: { className?: string }) {
	const c = upgradeContact();
	if (!c) return <p className={cn("text-sm text-muted-foreground", className)}>Contact your developer to upgrade.</p>;
	return (
		<p className={cn("text-sm text-muted-foreground", className)}>
			To upgrade, contact your developer:{" "}
			<a className="font-medium text-foreground underline" href={contactHref(c)} target="_blank" rel="noreferrer">{c}</a>
		</p>
	);
}

/** Full-page upsell shown instead of a page whose feature isn't in the plan. */
export function PlanLocked({ feature, eyebrow, title }: { feature: Feature; eyebrow: string; title: string }) {
	const { minPlan } = FEATURES[feature];
	const doc = guideEntry(feature);
	return (
		<>
			<PageHeader eyebrow={eyebrow} title={title} />
			<div className="max-w-2xl">
				<p className="eyebrow mb-3 flex items-center gap-2 text-brand"><Lock className="size-3.5" /> Available on {planName(minPlan)}</p>
				<p className="display text-2xl sm:text-3xl">{doc?.summary}</p>
				{doc?.steps && (
					<ol className="mt-6 space-y-2 text-sm text-muted-foreground">
						{doc.steps.map((s, i) => <li key={s} className="flex gap-3"><span className="numeral w-5 text-brand">{i + 1}</span>{s}</li>)}
					</ol>
				)}
				<p className="mt-6 text-sm">
					You&rsquo;re on <strong>{planName(currentPlan())}</strong>. {planName(minPlan)} adds this and more. <Link className="underline" href="/admin/settings#plan">Compare plans</Link>
				</p>
				<UpgradeContact className="mt-2" />
			</div>
		</>
	);
}

/** Small inline lock used inside cards. */
export function LockedNote({ feature }: { feature: Feature }) {
	return (
		<p className="flex items-center gap-2 text-sm text-muted-foreground">
			<Lock className="size-3.5 shrink-0" /> {FEATURES[feature].label}: available on the {planName(FEATURES[feature].minPlan)} plan.
		</p>
	);
}

const fmtLimit = (n: number) => (Number.isFinite(n) ? String(n) : "Unlimited");

export function PlanCard() {
	const plan = currentPlan();
	const next = nextPlan(plan);
	const l = limits(plan);
	const nextAdds = next ? (Object.keys(FEATURES) as Feature[]).filter((f) => FEATURES[f].minPlan === next) : [];
	return (
		<Card id="plan" className="h-fit scroll-mt-6">
			<CardHeader>
				<p className="eyebrow">Your plan</p>
				<CardTitle className="display text-4xl!">{planName(plan)}</CardTitle>
				<CardDescription>{PLAN_INFO[plan].tagline}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5 text-sm">
				<dl className="grid grid-cols-2 gap-3">
					<div><dt className="eyebrow">Products</dt><dd className="numeral text-xl">{fmtLimit(l.products)}</dd></div>
					<div><dt className="eyebrow">Staff</dt><dd className="numeral text-xl">{fmtLimit(l.staff)}</dd></div>
				</dl>
				<ul className="ledger">
					{(Object.keys(FEATURES) as Feature[]).map((f) => {
						const on = hasFeature(f, plan);
						return (
							<li key={f} className={cn("flex items-center gap-2 py-1.5", !on && "text-muted-foreground")}>
								{on ? <Check className="size-3.5 text-brand" /> : <Minus className="size-3.5 opacity-40" />}
								<span className="flex-1">{FEATURES[f].label}</span>
								{isSoon(f) && <span className="text-[11px]">Soon</span>}
								{!on && <span className="text-[11px]">{planName(FEATURES[f].minPlan)}</span>}
							</li>
						);
					})}
				</ul>
				{next && (
					<div className="border-t border-rule pt-4">
						<p className="font-medium">{planName(next)} adds</p>
						<p className="mt-1 text-muted-foreground">
							{[...nextAdds.map((f) => `${FEATURES[f].label}${isSoon(f) ? " (soon)" : ""}`), ...(Number.isFinite(l.products) ? ["unlimited products"] : []), `${fmtLimit(limits(next).staff).toLowerCase()} staff`].join(", ")}.
						</p>
						<UpgradeContact className="mt-2" />
					</div>
				)}
				<Link className="block underline" href="/admin/guide">Read the store guide →</Link>
			</CardContent>
		</Card>
	);
}
