import { Suspense } from "react";
import { SignInForm } from "@/components/app/auth-forms";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };
export default function Page() {
	return <Suspense><SignInForm google={Boolean(env("GOOGLE_CLIENT_ID"))} /></Suspense>;
}
