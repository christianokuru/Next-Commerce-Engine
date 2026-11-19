import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { Field } from "@/components/app/field";
import { PageHeader } from "@/components/app/ui-bits";
import { requireCustomer } from "@/server/session";
import { updateProfileAction } from "../actions";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Profile" };

export default async function Profile() {
	const { user, customer } = await requireCustomer();
	return (
		<>
			<PageHeader title="Profile" description={user.email} />
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader><CardTitle>Details</CardTitle></CardHeader>
					<CardContent>
						<ActionForm action={updateProfileAction}>
							<div className="grid grid-cols-2 gap-3">
								<Field label="First name" name="firstName" defaultValue={customer.firstName ?? ""} />
								<Field label="Last name" name="lastName" defaultValue={customer.lastName ?? ""} />
							</div>
							<Field label="Phone" name="phone" type="tel" defaultValue={customer.phone ?? ""} />
							<SubmitButton>Save</SubmitButton>
						</ActionForm>
					</CardContent>
				</Card>
				<Card>
					<CardHeader><CardTitle>Password</CardTitle></CardHeader>
					<CardContent><PasswordForm /></CardContent>
				</Card>
			</div>
		</>
	);
}
