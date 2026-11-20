import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { Field, SelectField } from "@/components/app/field";
import { Money, PageHeader, EmptyState, dateOnly } from "@/components/app/ui-bits";
import { listPromotions } from "@/modules/promotion/service";
import { getSettings } from "@/modules/store/service";
import { createPromotionAction, deletePromotionAction, togglePromotionAction } from "../actions";
import { hasFeature } from "@/lib/plan";
import { PlanLocked } from "@/components/app/plan";

export const metadata = { title: "Promotions" };

export default async function Promotions() {
	if (!hasFeature("discounts")) return <PlanLocked feature="discounts" eyebrow="Marketing" title="Promotions" />;
	const [promos, settings] = await Promise.all([listPromotions(), getSettings()]);
	return (
		<>
			<PageHeader eyebrow="Marketing" title="Promotions" description="Discount codes applied to carts via the Store API." />
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2 p-0">
					{promos.length ? (
						<ul className="divide-y">
							{promos.map((p) => (
								<li key={p.id} className="flex items-center gap-3 p-3">
									<div className="min-w-0 flex-1">
										<p className="font-mono font-medium">{p.code} {!p.isActive && <span className="font-sans text-xs text-muted-foreground">(inactive)</span>}</p>
										<p className="text-xs text-muted-foreground">
											{p.type === "percentage" ? `${p.value}% off` : p.type === "fixed" ? <><Money amount={p.value} currency={p.currencyCode!} /> off</> : "Free shipping"}
											{" · "}{p.usageCount}{p.usageLimit !== null ? `/${p.usageLimit}` : ""} used
											{p.endsAt && ` · ends ${dateOnly(p.endsAt)}`}
										</p>
									</div>
									<ActionForm action={togglePromotionAction} className="space-y-0">
										<input type="hidden" name="id" value={p.id} /><input type="hidden" name="isActive" value={String(!p.isActive)} />
										<Button type="submit" variant="outline" size="sm">{p.isActive ? "Disable" : "Enable"}</Button>
									</ActionForm>
									<ActionForm action={deletePromotionAction} confirm={`Delete ${p.code}?`} className="space-y-0">
										<input type="hidden" name="id" value={p.id} />
										<Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>
									</ActionForm>
								</li>
							))}
						</ul>
					) : <div className="p-4"><EmptyState title="No promotions" /></div>}
				</Card>
				<Card className="h-fit">
					<CardHeader><CardTitle>New promotion</CardTitle></CardHeader>
					<CardContent>
						<ActionForm action={createPromotionAction} resetOnSuccess>
							<Field label="Code" name="code" required pattern="[A-Za-z0-9_\-]{3,32}" className="uppercase" />
							<SelectField label="Type" name="type" options={[{ value: "percentage", label: "Percentage off" }, { value: "fixed", label: "Fixed amount off" }, { value: "free_shipping", label: "Free shipping" }]} />
							<div className="grid grid-cols-2 gap-3">
								<Field label="Value" name="value" inputMode="decimal" placeholder="10" hint="% or amount" />
								<SelectField label="Currency" name="currencyCode" defaultValue={settings.defaultCurrency} options={settings.currencies.map((c) => ({ value: c, label: c }))} />
							</div>
							<Field label="Minimum subtotal" name="minSubtotal" inputMode="decimal" />
							<Field label="Usage limit" name="usageLimit" type="number" min={1} />
							<div className="grid grid-cols-2 gap-3">
								<Field label="Starts" name="startsAt" type="datetime-local" />
								<Field label="Ends" name="endsAt" type="datetime-local" />
							</div>
							<Field label="Description" name="description" maxLength={300} />
							<SubmitButton className="w-full">Create promotion</SubmitButton>
						</ActionForm>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
