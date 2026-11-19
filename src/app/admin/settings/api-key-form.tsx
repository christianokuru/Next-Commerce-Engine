"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiKeyAction } from "../actions";

export function ApiKeyForm() {
	const [state, action, pending] = useActionState(createApiKeyAction, null);
	const key = state?.ok ? (state.data as { key: string }).key : null;
	return (
		<div className="space-y-3">
			<form action={action} className="flex gap-2">
				<Input name="name" placeholder="Key name, e.g. Zapier" required maxLength={80} className="h-10" aria-label="API key name" />
				<Button type="submit" variant="outline" disabled={pending} className="h-10">Create</Button>
			</form>
			{state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
			{key && (
				<div className="border border-brand/50 bg-brand/5 p-3" style={{ borderRadius: "var(--radius)" }}>
					<p className="text-xs font-medium">Copy this key now — it won&apos;t be shown again.</p>
					<div className="mt-2 flex gap-2">
						<code className="min-w-0 flex-1 truncate bg-background px-2 py-2 text-xs">{key}</code>
						<Button size="icon" variant="ghost" aria-label="Copy key" onClick={() => navigator.clipboard.writeText(key).then(() => toast.success("Copied"))}><Copy /></Button>
					</div>
				</div>
			)}
		</div>
	);
}
