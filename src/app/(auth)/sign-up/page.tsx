import Link from "next/link";
import { SignUpForm } from "@/components/app/auth-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasFeature } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };
export default function Page() {
	if (!hasFeature("customerAccounts"))
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-xl">Accounts aren&rsquo;t available</CardTitle>
					<CardDescription>This store uses guest checkout, so you don&rsquo;t need an account to buy. Order updates are sent to your email.</CardDescription>
				</CardHeader>
				<CardContent className="text-sm"><Link className="underline" href="/sign-in">Staff sign in</Link></CardContent>
			</Card>
		);
	return <SignUpForm />;
}
