"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/app/password-field";

export function PasswordForm() {
	const [busy, setBusy] = useState(false);
	return (
		<form
			className="space-y-4"
			onSubmit={async (e) => {
				e.preventDefault();
				const form = e.currentTarget;
				const fd = new FormData(form);
				setBusy(true);
				const { error } = await authClient.changePassword({
					currentPassword: String(fd.get("currentPassword")), newPassword: String(fd.get("newPassword")), revokeOtherSessions: true,
				});
				setBusy(false);
				if (error) return void toast.error(error.message ?? "Could not change password");
				form.reset();
				toast.success("Password changed. Other devices were signed out.");
			}}
		>
			<PasswordField label="Current password" name="currentPassword" minLength={1} required autoComplete="current-password" />
			<PasswordField label="New password" name="newPassword" minLength={8} meter required autoComplete="new-password" />
			<Button type="submit" disabled={busy} className="h-10">Change password</Button>
		</form>
	);
}
