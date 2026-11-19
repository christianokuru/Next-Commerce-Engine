import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
	return (
		<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
				{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
			</div>
			{actions && <div className="flex flex-wrap gap-2">{actions}</div>}
		</div>
	);
}

export function Money({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
	return <span className={cn("tabular-nums", className)}>{formatMoney(amount, currency)}</span>;
}

const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
	published: "default", completed: "default", captured: "default", delivered: "default", succeeded: "default",
	pending: "secondary", draft: "secondary", not_fulfilled: "secondary", fulfilled: "secondary", shipped: "secondary", partially_refunded: "secondary",
	canceled: "outline", archived: "outline", refunded: "outline",
	requires_action: "destructive", failed: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
	return <Badge variant={TONE[status] ?? "outline"} className="capitalize">{status.replace(/_/g, " ")}</Badge>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
			<p className="font-medium">{title}</p>
			{description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}

export function Pagination({ total, limit, offset, basePath, params = {} }: { total: number; limit: number; offset: number; basePath: string; params?: Record<string, string | undefined> }) {
	if (total <= limit) return null;
	const href = (o: number) => {
		const q = new URLSearchParams(Object.entries({ ...params, offset: String(o) }).filter(([, v]) => v) as [string, string][]);
		return `${basePath}?${q}`;
	};
	return (
		<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
			<span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
			<div className="flex gap-2">
				{offset > 0 && <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={href(Math.max(0, offset - limit))}>Previous</Link>}
				{offset + limit < total && <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={href(offset + limit)}>Next</Link>}
			</div>
		</div>
	);
}

export function dateTime(d: Date | string) {
	return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}
export function dateOnly(d: Date | string) {
	return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(d));
}
