"use client";

import { useState } from "react";
import { Eye, EyeOff, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Patterns cracking tools try first: common words, keyboard rows, sequences, repeats.
const COMMON = /password|qwerty|asdf|zxcv|letmein|welcome|admin|iloveyou|monkey|dragon|1234|abcd|(.)\1{3,}/i;
const LEVELS = [
	{ label: "Too short", color: "bg-destructive" },
	{ label: "Weak", color: "bg-destructive" },
	{ label: "Fair", color: "bg-amber-500" },
	{ label: "Good", color: "bg-emerald-500" },
	{ label: "Strong", color: "bg-emerald-600" },
] as const;

/** 0–4. Length matters most; variety and avoiding common patterns add the rest. */
export function passwordScore(pw: string, minLength: number) {
	if (pw.length < minLength) return 0;
	const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
	let s = 1 + (pw.length >= minLength + 4 ? 1 : 0) + (variety >= 3 ? 1 : 0) + (pw.length >= 16 || variety === 4 ? 1 : 0);
	if (COMMON.test(pw)) s = Math.min(s, 2);
	return Math.min(s, 4);
}

type Props = {
	label: string;
	name: string;
	minLength?: number;
	/** Show the strength meter and checklist (for new passwords). */
	meter?: boolean;
} & Omit<React.ComponentProps<"input">, "name" | "type" | "minLength">;

export function PasswordField({ label, name, minLength = 8, meter, className, ...input }: Props) {
	const id = input.id ?? name; // same convention as <Field>: id = name
	const [show, setShow] = useState(false);
	const [value, setValue] = useState("");
	const score = passwordScore(value, minLength);
	const level = LEVELS[score];
	const common = value.length >= minLength && COMMON.test(value);
	const checks = [
		{ ok: value.length >= minLength, text: `${minLength}+ characters` },
		{ ok: /[a-z]/.test(value) && /[A-Z]/.test(value), text: "Upper & lower case" },
		{ ok: /\d/.test(value), text: "A number" },
		{ ok: /[^A-Za-z0-9]/.test(value), text: "A symbol" },
	];

	return (
		<div className={cn("grid gap-1.5", className)}>
			<Label htmlFor={id}>{label}</Label>
			<div className="relative">
				<Input
					id={id}
					name={name}
					type={show ? "text" : "password"}
					minLength={minLength}
					className="h-10 pr-10"
					onChange={(e) => setValue(e.target.value)}
					ref={(el) => {
						// Keep the meter in sync when the parent form is reset.
						const form = el?.form;
						if (!form) return;
						const clear = () => setValue("");
						form.addEventListener("reset", clear);
						return () => form.removeEventListener("reset", clear);
					}}
					aria-describedby={meter ? `${id}-strength` : undefined}
					{...input}
				/>
				<button
					type="button"
					onClick={() => setShow((s) => !s)}
					className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
					aria-label={show ? "Hide password" : "Show password"}
					aria-pressed={show}
				>
					{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</button>
			</div>
			{meter && (
				<div id={`${id}-strength`} className="grid gap-2 pt-1" aria-live="polite">
					<div className="flex items-center gap-3">
						<div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
							{[1, 2, 3, 4].map((i) => (
								<span key={i} className={cn("h-1 rounded-full transition-colors duration-300", value && score >= i ? level.color : "bg-border", value && score === 0 && i === 1 && level.color)} />
							))}
						</div>
						<span className="eyebrow min-w-16 text-right">{value ? level.label : "Strength"}</span>
					</div>
					<ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
						{checks.map((c) => (
							<li key={c.text} className={cn("flex items-center gap-1.5 transition-colors", c.ok ? "text-foreground" : "text-muted-foreground")}>
								<Check className={cn("size-3 transition-opacity", c.ok ? "opacity-100 text-emerald-600" : "opacity-30")} />
								{c.text}
							</li>
						))}
					</ul>
					{common && (
						<p className="text-xs text-muted-foreground">
							Contains a common pattern (like qwerty, 1234 or abcd) that attackers guess first. Mix in an unrelated word to make it strong.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
