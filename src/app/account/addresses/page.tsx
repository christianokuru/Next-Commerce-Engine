import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { CheckboxField, Field } from "@/components/app/field";
import { PageHeader, EmptyState } from "@/components/app/ui-bits";
import { requireCustomer } from "@/server/session";
import { listAddresses } from "@/modules/customer/service";
import { AddressBlock } from "@/app/admin/orders/address";
import { addAddressAction, deleteAddressAction } from "../actions";

export const metadata = { title: "Addresses" };

export default async function Addresses() {
	const { customer } = await requireCustomer();
	const list = await listAddresses(customer.id);
	return (
		<>
			<PageHeader title="Addresses" />
			<div className="grid gap-4 lg:grid-cols-3">
				<div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
					{list.length ? list.map((a) => (
						<Card key={a.id} size="sm">
							<CardContent className="flex justify-between gap-2">
								<div>{a.isDefault && <p className="mb-1 text-xs font-medium text-muted-foreground">Default</p>}<AddressBlock a={a.address} /></div>
								<ActionForm action={deleteAddressAction} confirm="Remove this address?" className="space-y-0">
									<input type="hidden" name="id" value={a.id} />
									<Button type="submit" variant="ghost" size="icon-sm" aria-label="Remove"><Trash2 /></Button>
								</ActionForm>
							</CardContent>
						</Card>
					)) : <div className="sm:col-span-2"><EmptyState title="No saved addresses" /></div>}
				</div>
				<Card className="h-fit">
					<CardHeader><CardTitle>Add address</CardTitle></CardHeader>
					<CardContent>
						<ActionForm action={addAddressAction} resetOnSuccess>
							<div className="grid grid-cols-2 gap-3">
								<Field label="First name" name="firstName" required autoComplete="given-name" />
								<Field label="Last name" name="lastName" required autoComplete="family-name" />
							</div>
							<Field label="Address" name="address1" required autoComplete="address-line1" />
							<Field label="Apartment, suite (optional)" name="address2" autoComplete="address-line2" />
							<div className="grid grid-cols-2 gap-3">
								<Field label="City" name="city" required autoComplete="address-level2" />
								<Field label="State" name="province" autoComplete="address-level1" />
								<Field label="Postal code" name="postalCode" autoComplete="postal-code" />
								<Field label="Country (ISO)" name="countryCode" required defaultValue="NG" maxLength={2} autoComplete="country" />
							</div>
							<Field label="Phone" name="phone" type="tel" autoComplete="tel" />
							<CheckboxField label="Set as default" name="isDefault" />
							<SubmitButton className="w-full">Save address</SubmitButton>
						</ActionForm>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
