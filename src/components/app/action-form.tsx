"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useTransition } from "react";
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

const PendingContext = createContext(false);

/**
 * Form bound to a server action with toast feedback.
 * Submits via a transition (instead of `<form action>`) so React 19 does not auto-reset
 * the fields — users keep their input when validation fails. `action` is kept for no-JS fallback.
 */
export function ActionForm({ action, resetOnSuccess, confirm, children, className, ...rest }: Props) {
	const [state, formAction] = useActionState(action, null);
	const [pending, startTransition] = useTransition();
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
				e.preventDefault();
				if (pending || (confirm && !window.confirm(confirm))) return;
				const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
				startTransition(() => formAction(fd));
			}}
			{...rest}
		>
			<PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
		</form>
	);
}

export function SubmitButton({ children, className, disabled, ...props }: React.ComponentProps<typeof Button>) {
	const pending = useContext(PendingContext);
	return (
		<Button type="submit" disabled={pending || disabled} className={cn("min-h-10", className)} {...props}>
			{pending && <Loader2 className="animate-spin" />}
			{children}
		</Button>
	);
}
