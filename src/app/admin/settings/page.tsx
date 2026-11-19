import { desc, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { CheckboxField, Field, SelectField } from "@/components/app/field";
import { PageHeader } from "@/components/app/ui-bits";
import { db } from "@/db";
import { user } from "@/modules/auth/schema";
import { getSettingsUncached } from "@/modules/store/service";
import { allProviders } from "@/modules/payment/providers";
import { appUrl } from "@/lib/env";
import { setAdminRoleAction, updateSettingsAction } from "../actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const [s, admins] = await Promise.all([
		getSettingsUncached(),
		db().select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, "admin")).orderBy(desc(user.createdAt)),
	]);
	return (
		<>
			<PageHeader title="Settings" />
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
								<Field label="Currencies" name="currencies" defaultValue={s.currencies.join(", ")} hint="e.g. NGN, USD, GBP" />
								<Field label="Tax rate (%)" name="taxRate" inputMode="decimal" defaultValue={String(s.taxRateBps / 100)} />
							</div>
							<CheckboxField label="Prices include tax" name="taxInclusive" defaultChecked={s.taxInclusive} hint="Typical for NGN (VAT-inclusive pricing)" />
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Payment providers</CardTitle>
							<CardDescription>API keys are Worker secrets. Webhook URL: <code className="break-all">{appUrl()}/api/webhooks/&#123;provider&#125;</code></CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{allProviders().map((p) => (
								<div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
									<CheckboxField label={p.label} name={`provider_${p.id}`} defaultChecked={s.paymentProviders.includes(p.id)} hint={p.currencies ? p.currencies.join(", ") : "All Stripe currencies"} />
									<Badge variant={p.isConfigured() ? "default" : "outline"}>{p.isConfigured() ? "Keys set" : "Missing keys"}</Badge>
								</div>
							))}
						</CardContent>
					</Card>
					<SubmitButton>Save settings</SubmitButton>
				</ActionForm>

				<Card className="h-fit">
					<CardHeader><CardTitle>Team</CardTitle><CardDescription>Admins can manage everything in this dashboard.</CardDescription></CardHeader>
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
			</div>
		</>
	);
}
