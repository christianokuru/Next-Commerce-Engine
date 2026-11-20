"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "./field";
import { PasswordField } from "./password-field";

function safeNext(n: string | null) {
	return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

function Shell({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-xl">{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent className="space-y-4">
				{children}
				{footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
			</CardContent>
		</Card>
	);
}

function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
	return (
		<Button type="submit" className="h-10 w-full" disabled={busy}>
			{busy && <Loader2 className="animate-spin" />} {children}
		</Button>
	);
}

export function SignInForm({ google }: { google: boolean }) {
	const router = useRouter();
	const next = safeNext(useSearchParams().get("next"));
	const [busy, setBusy] = useState(false);
	return (
		<Shell title="Sign in" description="Welcome back" footer={<>No account? <Link className="underline" href="/sign-up">Create one</Link></>}>
			<form
				className="space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					const fd = new FormData(e.currentTarget);
					setBusy(true);
					const { error } = await authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) });
					setBusy(false);
					if (error) {
						if (error.status === 403) { toast.error("Please verify your email first. We've sent you a new link."); return; }
						toast.error(error.message ?? "Invalid email or password");
						return;
					}
					router.replace(next);
					router.refresh();
				}}
			>
				<Field label="Email" name="email" type="email" autoComplete="email" required />
				<PasswordField label="Password" name="password" autoComplete="current-password" minLength={1} required />
				<div className="text-right text-sm"><Link className="text-muted-foreground underline" href="/forgot-password">Forgot password?</Link></div>
				<Submit busy={busy}>Sign in</Submit>
			</form>
			{google && (
				<Button variant="outline" className="h-10 w-full" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}>
					Continue with Google
				</Button>
			)}
		</Shell>
	);
}

export function SignUpForm() {
	const [busy, setBusy] = useState(false);
	const [sent, setSent] = useState<string | null>(null);
	if (sent)
		return <Shell title="Check your email" description={`We sent a verification link to ${sent}. Open it to activate your account.`}>{null}</Shell>;
	return (
		<Shell title="Create account" footer={<>Have an account? <Link className="underline" href="/sign-in">Sign in</Link></>}>
			<form
				className="space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					const fd = new FormData(e.currentTarget);
					const email = String(fd.get("email"));
					setBusy(true);
					const { error } = await authClient.signUp.email({ name: String(fd.get("name")), email, password: String(fd.get("password")), callbackURL: "/account" });
					setBusy(false);
					if (error) return void toast.error(error.message ?? "Could not create account");
					setSent(email);
				}}
			>
				<Field label="Full name" name="name" autoComplete="name" required maxLength={100} />
				<Field label="Email" name="email" type="email" autoComplete="email" required />
				<PasswordField label="Password" name="password" autoComplete="new-password" minLength={8} meter required />
				<Submit busy={busy}>Create account</Submit>
			</form>
		</Shell>
	);
}

export function ForgotPasswordForm() {
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);
	if (done) return <Shell title="Check your email" description="If an account exists for that address, a reset link is on its way.">{null}</Shell>;
	return (
		<Shell title="Reset password" footer={<Link className="underline" href="/sign-in">Back to sign in</Link>}>
			<form
				className="space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setBusy(true);
					await authClient.requestPasswordReset({ email: String(new FormData(e.currentTarget).get("email")), redirectTo: "/reset-password" });
					setBusy(false);
					setDone(true); // same response either way: no account enumeration
				}}
			>
				<Field label="Email" name="email" type="email" autoComplete="email" required />
				<Submit busy={busy}>Send reset link</Submit>
			</form>
		</Shell>
	);
}

export function ResetPasswordForm() {
	const token = useSearchParams().get("token");
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	if (!token) return <Shell title="Invalid link" description="This reset link is invalid or has expired.">{null}</Shell>;
	return (
		<Shell title="Choose a new password">
			<form
				className="space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setBusy(true);
					const { error } = await authClient.resetPassword({ newPassword: String(new FormData(e.currentTarget).get("password")), token });
					setBusy(false);
					if (error) return void toast.error(error.message ?? "Reset failed");
					toast.success("Password updated. Please sign in.");
					router.replace("/sign-in");
				}}
			>
				<PasswordField label="New password" name="password" autoComplete="new-password" minLength={8} meter required />
				<Submit busy={busy}>Update password</Submit>
			</form>
		</Shell>
	);
}

export function ResendVerification() {
	const [busy, setBusy] = useState(false);
	return (
		<Shell title="Verify your email" description="Your account needs a verified email before you can view orders.">
			<form
				className="space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setBusy(true);
					await authClient.sendVerificationEmail({ email: String(new FormData(e.currentTarget).get("email")), callbackURL: "/account" });
					setBusy(false);
					toast.success("If the address is registered, a verification link was sent.");
				}}
			>
				<Field label="Email" name="email" type="email" required />
				<Submit busy={busy}>Resend verification email</Submit>
			</form>
		</Shell>
	);
}
