import { Suspense } from "react";
import { SignInForm } from "@/components/app/auth-forms";
import { env } from "@/lib/env";
import { hasFeature } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };
export default function Page() {
	const accounts = hasFeature("customerAccounts");
	return <Suspense><SignInForm google={accounts && Boolean(env("GOOGLE_CLIENT_ID"))} signUp={accounts} /></Suspense>;
}
