import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { Field } from "@/components/app/field";
import { createFirstAdmin, hasAdmin, setupTokenRequired } from "./actions";

export const metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
	if (await hasAdmin()) notFound();
	const needsToken = await setupTokenRequired();
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-xl">Create the first admin</CardTitle>
				<CardDescription>{needsToken ? "Enter the SETUP_TOKEN configured on the server. " : ""}This page disappears once an admin exists.</CardDescription>
			</CardHeader>
			<CardContent>
				<ActionForm action={createFirstAdmin}>
					{needsToken && <Field label="Setup token" name="token" type="password" required autoComplete="off" />}
					<Field label="Full name" name="name" required />
					<Field label="Email" name="email" type="email" required />
					<Field label="Password" name="password" type="password" minLength={10} required autoComplete="new-password" />
					<SubmitButton className="w-full">Create admin</SubmitButton>
				</ActionForm>
			</CardContent>
		</Card>
	);
}
