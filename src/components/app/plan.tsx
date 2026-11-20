import Link from "next/link";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FEATURES, PLAN_INFO, availableFeatures, currentPlan, limits, planName } from "@/lib/plan";

const fmtLimit = (n: number) => (Number.isFinite(n) ? String(n) : "Unlimited");

/** What this store includes. Only shows what's switched on: no locked items, no other tiers. */
export function PlanCard() {
	const plan = currentPlan();
	const l = limits(plan);
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
					{["Orders & payments", "Shipping & order emails", "Products & categories", "Appearance"].map((label) => (
						<li key={label} className="flex items-center gap-2 py-1.5"><Check className="size-3.5 text-brand" />{label}</li>
					))}
					{availableFeatures(plan).map((f) => (
						<li key={f} className="flex items-center gap-2 py-1.5"><Check className="size-3.5 text-brand" />{FEATURES[f].label}</li>
					))}
				</ul>
				<Link className="block underline" href="/admin/guide">Read the store guide →</Link>
			</CardContent>
		</Card>
	);
}
