import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { CheckboxField, Field, SelectField } from "@/components/app/field";
import { PageHeader } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { listAdmins, listApiKeys } from "@/modules/auth/service";
import { dateOnly } from "@/components/app/ui-bits";
import { ApiKeyForm } from "./api-key-form";
import { getSettingsUncached } from "@/modules/store/service";
import { allProviders } from "@/modules/payment/providers";
import { appUrl } from "@/lib/env";
import { revokeApiKeyAction, setAdminRoleAction, updateSettingsAction } from "../actions";
import { LockedNote, PlanCard } from "@/components/app/plan";
import { allowedProviders, hasFeature, limits } from "@/lib/plan";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const [s, admins, keys] = await Promise.all([getSettingsUncached(), listAdmins(), listApiKeys()]);
	const multiCurrency = hasFeature("multiCurrency");
	const apiKeys = hasFeature("apiKeys");
	const maxStaff = limits().staff;
	const providers = allProviders().filter((p) => allowedProviders().includes(p.id));
	return (
		<>
			<PageHeader eyebrow="Store" title="Settings" />
			<div className="grid gap-4 lg:grid-cols-3">
				<ActionForm action={updateSettingsAction} className="space-y-4 lg:col-span-2">
					<Card>
						<CardHeader><CardTitle>Store</CardTitle></CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<Field label="Store name" name="name" required defaultValue={s.name} />
								<Field label="Support email" name="supportEmail" type="email" defaultValue={s.supportEmail ?? ""} hint="Receives new-order alerts; reply-to on customer emails" />
								<Field label="Storefront URL" name="storefrontUrl" type="url" defaultValue={s.storefrontUrl ?? ""} hint="Shoppers return to {url}/checkout/complete after paying" />
								<Field label="Logo URL" name="logoUrl" type="url" defaultValue={s.logoUrl ?? ""} />
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader><CardTitle>Currency & tax</CardTitle></CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-3">
								<SelectField label="Default currency" name="defaultCurrency" defaultValue={s.defaultCurrency} options={s.currencies.map((c) => ({ value: c, label: c }))} />
								{multiCurrency
									? <Field label="Currencies" name="currencies" defaultValue={s.currencies.join(", ")} hint="e.g. NGN, USD, GBP" />
									: <input type="hidden" name="currencies" value={s.defaultCurrency} />}
								<Field label="Tax rate (%)" name="taxRate" inputMode="decimal" defaultValue={String(s.taxRateBps / 100)} />
							</div>
							{!multiCurrency && <LockedNote feature="multiCurrency" />}
							<CheckboxField label="Prices include tax" name="taxInclusive" defaultChecked={s.taxInclusive} hint="Typical for NGN (VAT-inclusive pricing)" />
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Payment providers</CardTitle>
							<CardDescription>API keys are Worker secrets. Webhook URL: <code className="break-all">{appUrl()}/api/webhooks/&#123;provider&#125;</code></CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{providers.map((p) => (
								<div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
									<CheckboxField label={p.label} name={`provider_${p.id}`} defaultChecked={s.paymentProviders.includes(p.id)} hint={p.currencies ? p.currencies.join(", ") : "All Stripe currencies"} />
									<Badge variant={p.isConfigured() ? "default" : "outline"}>{p.isConfigured() ? "Keys set" : "Missing keys"}</Badge>
								</div>
							))}
						</CardContent>
					</Card>
					<SubmitButton>Save settings</SubmitButton>
				</ActionForm>

				<div className="space-y-4">
				<PlanCard />
				<Card className="h-fit">
					<CardHeader>
						<CardTitle>Team</CardTitle>
						<CardDescription>
							Admins can manage everything in this dashboard. {Number.isFinite(maxStaff) ? `Staff accounts used: ${admins.length} of ${maxStaff}.` : ""}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<ul className="space-y-2 text-sm">
							{admins.map((a) => <li key={a.id}><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.email}</p></li>)}
						</ul>
						<ActionForm action={setAdminRoleAction} resetOnSuccess>
							<Field label="User email" name="email" type="email" required hint="The user must have signed up already" />
							<SelectField label="Role" name="role" options={[{ value: "admin", label: "Make admin" }, { value: "customer", label: "Remove admin" }]} />
							<SubmitButton variant="outline" className="w-full">Update role</SubmitButton>
						</ActionForm>
					</CardContent>
				</Card>

				<Card className="h-fit">
					<CardHeader>
						<CardTitle>API keys</CardTitle>
						<CardDescription>For the Admin REST API (<code>/api/admin/*</code>). Send as <code>Authorization: Bearer nce_sk_…</code>.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{apiKeys ? <ApiKeyForm /> : <LockedNote feature="apiKeys" />}
						<ul className="ledger text-sm">
							{keys.map((k) => (
								<li key={k.id} className="flex items-center justify-between gap-2 py-2.5">
									<div className="min-w-0">
										<p className={k.revokedAt ? "text-muted-foreground line-through" : "font-medium"}>{k.name}</p>
										<p className="font-mono text-[11px] text-muted-foreground">{k.prefix}… · {k.lastUsedAt ? `used ${dateOnly(k.lastUsedAt)}` : "never used"}</p>
									</div>
									{!k.revokedAt && apiKeys && (
										<ActionForm action={revokeApiKeyAction} confirm={`Revoke ${k.name}? Integrations using it will stop working.`} className="space-y-0">
											<input type="hidden" name="id" value={k.id} />
											<Button type="submit" variant="ghost" size="sm" className="text-destructive">Revoke</Button>
										</ActionForm>
									)}
								</li>
							))}
							{!keys.length && <li className="py-2.5 text-muted-foreground">No keys yet.</li>}
						</ul>
					</CardContent>
				</Card>
				</div>
			</div>
		</>
	);
}
