import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FieldProps = { label: string; name: string; hint?: string; className?: string } & Omit<React.ComponentProps<"input">, "name">;

export function Field({ label, name, hint, className, ...input }: FieldProps) {
	return (
		<div className={cn("grid gap-1.5", className)}>
			<Label htmlFor={name}>{label}</Label>
			<Input id={name} name={name} className="h-10" {...input} />
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}

export function TextareaField({ label, name, className, ...props }: { label: string; name: string; className?: string } & Omit<React.ComponentProps<"textarea">, "name">) {
	return (
		<div className={cn("grid gap-1.5", className)}>
			<Label htmlFor={name}>{label}</Label>
			<Textarea id={name} name={name} {...props} />
		</div>
	);
}

/** Native select: best UX on mobile and works without JS. */
export function SelectField({
	label, name, options, className, ...props
}: { label: string; name: string; options: { value: string; label: string }[]; className?: string } & Omit<React.ComponentProps<"select">, "name">) {
	return (
		<div className={cn("grid gap-1.5", className)}>
			<Label htmlFor={name}>{label}</Label>
			<select
				id={name}
				name={name}
				className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
				{...props}
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>{o.label}</option>
				))}
			</select>
		</div>
	);
}

export function CheckboxField({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
	return (
		<label className="flex items-start gap-2.5 text-sm">
			<input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-primary" />
			<span>
				{label}
				{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
			</span>
		</label>
	);
}
