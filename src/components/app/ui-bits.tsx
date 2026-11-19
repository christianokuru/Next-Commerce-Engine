import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Editorial page header: kicker, display title, standfirst, hairline rule. */
export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
	return (
		<header className="mb-8 flex flex-col gap-4 border-b border-rule pb-6 sm:flex-row sm:items-end sm:justify-between">
			<div className="min-w-0">
				{eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
				<h1 className="display text-4xl sm:text-5xl">{title}</h1>
				{description && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{description}</p>}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</header>
	);
}

export function Money({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
	return <span className={cn("tabular-nums", className)}>{formatMoney(amount, currency)}</span>;
}

const TONE: Record<string, "ok" | "wait" | "off" | "alert"> = {
	published: "ok", completed: "ok", captured: "ok", delivered: "ok", succeeded: "ok",
	pending: "wait", draft: "wait", not_fulfilled: "wait", fulfilled: "wait", shipped: "wait", partially_refunded: "wait",
	canceled: "off", archived: "off", refunded: "off",
	requires_action: "alert", failed: "alert",
};
const DOT = { ok: "bg-foreground", wait: "bg-brand", off: "bg-muted-foreground/40", alert: "bg-destructive" };

/** Typographic status mark (dot + small caps) instead of pills. */
export function StatusBadge({ status }: { status: string }) {
	const tone = TONE[status] ?? "off";
	return (
		<span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.12em]", tone === "alert" ? "text-destructive" : tone === "off" ? "text-muted-foreground" : "text-foreground")}>
			<span className={cn("size-1.5 rounded-full", DOT[tone])} />
			{status.replace(/_/g, " ")}
		</span>
	);
}

export function Stat({ label, value, note, className }: { label: string; value: React.ReactNode; note?: React.ReactNode; className?: string }) {
	return (
		<div className={cn("min-w-0 py-4 pr-4", className)}>
			<p className="eyebrow">{label}</p>
			<p className="numeral mt-2 truncate text-3xl sm:text-4xl">{value}</p>
			{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
		</div>
	);
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
	return (
		<div className="flex flex-col items-center justify-center border-y border-dashed border-border px-6 py-14 text-center">
			<p className="display text-2xl">{title}</p>
			{description && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
			{action && <div className="mt-5">{action}</div>}
		</div>
	);
}

export function Pagination({ total, limit, offset, basePath, params = {} }: { total: number; limit: number; offset: number; basePath: string; params?: Record<string, string | undefined> }) {
	if (total <= limit) return null;
	const href = (o: number) => `${basePath}?${new URLSearchParams(Object.entries({ ...params, offset: String(o) }).filter(([, v]) => v) as [string, string][])}`;
	return (
		<div className="mt-6 flex items-center justify-between border-t border-rule pt-3 text-sm text-muted-foreground">
			<span className="tabular-nums">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
			<div className="flex gap-4">
				{offset > 0 && <Link className="hover:text-foreground hover:underline" href={href(Math.max(0, offset - limit))}>← Previous</Link>}
				{offset + limit < total && <Link className="hover:text-foreground hover:underline" href={href(offset + limit)}>Next →</Link>}
			</div>
		</div>
	);
}

/** Thumbnail with an editorial plate border. */
export function Plate({ src, className }: { src: string | null; className?: string }) {
	return (
		<div className={cn("shrink-0 overflow-hidden rounded-[calc(var(--radius)*0.8)] bg-muted ring-1 ring-border", className)}>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			{src && <img src={src} alt="" className="size-full object-cover" loading="lazy" />}
		</div>
	);
}

export function dateTime(d: Date | string) {
	return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}
export function dateOnly(d: Date | string) {
	return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(d));
}

/** Search/filter bar styled as a single underlined line. */
export function FilterBar({ children }: { children: React.ReactNode }) {
	return <form className="mb-6 flex flex-col gap-2 sm:flex-row [&_input]:h-10 [&_select]:h-10">{children}</form>;
}
