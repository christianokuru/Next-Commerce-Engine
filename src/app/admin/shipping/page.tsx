import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { Field, SelectField } from "@/components/app/field";
import { Money, PageHeader, EmptyState } from "@/components/app/ui-bits";
import { listZones } from "@/modules/shipping/service";
import { getSettings } from "@/modules/store/service";
import { createShippingOptionAction, createZoneAction, deleteShippingOptionAction, deleteZoneAction, toggleShippingOptionAction } from "../actions";

export const metadata = { title: "Shipping" };

export default async function Shipping() {
	const [zones, settings] = await Promise.all([listZones(), getSettings()]);
	return (
		<>
			<PageHeader eyebrow="Operations" title="Shipping" description="Zones group countries; options are the rates shoppers choose at checkout." />
			<div className="grid gap-4 lg:grid-cols-3">
				<div className="space-y-4 lg:col-span-2">
					{zones.length ? zones.map((z) => (
						<Card key={z.id}>
							<CardHeader>
								<CardTitle>{z.name}</CardTitle>
								<CardDescription>{z.countries.join(", ")}</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{z.options.map((o) => (
									<div key={o.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
										<div className="min-w-0 flex-1">
											<p className="font-medium">{o.name} {!o.isActive && <span className="text-xs text-muted-foreground">(off)</span>}</p>
											<p className="text-xs text-muted-foreground">
												<Money amount={o.amount} currency={o.currencyCode} />
												{o.freeOverAmount !== null && <> · free over <Money amount={o.freeOverAmount} currency={o.currencyCode} /></>}
												{o.minDeliveryDays !== null && ` · ${o.minDeliveryDays}–${o.maxDeliveryDays ?? o.minDeliveryDays} days`}
											</p>
										</div>
										<ActionForm action={toggleShippingOptionAction} className="space-y-0">
											<input type="hidden" name="id" value={o.id} /><input type="hidden" name="isActive" value={String(!o.isActive)} />
											<Button type="submit" variant="outline" size="sm">{o.isActive ? "Disable" : "Enable"}</Button>
										</ActionForm>
										<ActionForm action={deleteShippingOptionAction} confirm="Delete option?" className="space-y-0">
											<input type="hidden" name="id" value={o.id} />
											<Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>
										</ActionForm>
									</div>
								))}
								<details className="rounded-lg border border-dashed">
									<summary className="cursor-pointer list-none p-2.5 text-sm font-medium">+ Add rate</summary>
									<div className="border-t p-3">
										<ActionForm action={createShippingOptionAction} resetOnSuccess>
											<input type="hidden" name="zoneId" value={z.id} />
											<div className="grid gap-3 sm:grid-cols-3">
												<Field label="Name" name="name" required placeholder="Standard (Lagos)" />
												<SelectField label="Currency" name="currencyCode" defaultValue={settings.defaultCurrency} options={settings.currencies.map((c) => ({ value: c, label: c }))} />
												<Field label="Price" name="amount" inputMode="decimal" required />
												<Field label="Free over" name="freeOverAmount" inputMode="decimal" />
												<Field label="Min days" name="minDeliveryDays" type="number" min={0} />
												<Field label="Max days" name="maxDeliveryDays" type="number" min={0} />
											</div>
											<SubmitButton size="sm">Add rate</SubmitButton>
										</ActionForm>
									</div>
								</details>
								<ActionForm action={deleteZoneAction} confirm={`Delete ${z.name} and its rates?`}>
									<input type="hidden" name="id" value={z.id} />
									<Button type="submit" variant="ghost" size="sm" className="text-destructive"><Trash2 /> Delete zone</Button>
								</ActionForm>
							</CardContent>
						</Card>
					)) : <EmptyState title="No shipping zones" description="Without zones, checkout won't require a shipping method." />}
				</div>
				<Card className="h-fit">
					<CardHeader><CardTitle>New zone</CardTitle></CardHeader>
					<CardContent>
						<ActionForm action={createZoneAction} resetOnSuccess>
							<Field label="Name" name="name" required placeholder="Nigeria" />
							<Field label="Countries" name="countries" required placeholder="NG, GH" hint="ISO 3166 two-letter codes" />
							<SubmitButton className="w-full">Create zone</SubmitButton>
						</ActionForm>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
