"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"form">, "action"> & {
	action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
	resetOnSuccess?: boolean;
	confirm?: string;
};

/** Progressive-enhancement form bound to a server action, with toast feedback. */
export function ActionForm({ action, resetOnSuccess, confirm, children, className, onSubmit, ...rest }: Props) {
	const [state, formAction] = useActionState(action, null);
	const ref = useRef<HTMLFormElement>(null);
	useEffect(() => {
		if (!state) return;
		if (state.ok) {
			if (state.message) toast.success(state.message);
			if (resetOnSuccess) ref.current?.reset();
		} else if (state.error) toast.error(state.error);
	}, [state, resetOnSuccess]);
	return (
		<form
			ref={ref}
			action={formAction}
			className={cn("space-y-4", className)}
			onSubmit={(e) => {
				if (confirm && !window.confirm(confirm)) e.preventDefault();
				onSubmit?.(e);
			}}
			{...rest}
		>
			{children}
		</form>
	);
}

export function SubmitButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending} className={cn("min-h-10", className)} {...props}>
			{pending && <Loader2 className="animate-spin" />}
			{children}
		</Button>
	);
}
