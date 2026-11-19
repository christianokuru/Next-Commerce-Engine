import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money, PageHeader, StatusBadge, dateTime, EmptyState } from "@/components/app/ui-bits";
import { dashboardStats } from "@/modules/order/service";
import { listInventory } from "@/modules/inventory/service";
import { listPaymentsNeedingAttention } from "@/modules/payment/service";
import { getSettings } from "@/modules/store/service";

export const dynamic = "force-dynamic";

export default async function Overview() {
	const [stats, lowStock, attention, settings] = await Promise.all([
		dashboardStats(30), listInventory({ lowStockOnly: true, limit: 8 }), listPaymentsNeedingAttention(), getSettings(),
	]);
	const cur = stats.revenueCurrency ?? settings.defaultCurrency;
	const max = Math.max(1, ...stats.byDay.map((d) => d.total));
	const tiles = [
		{ label: "Revenue (30d)", value: <Money amount={stats.revenue} currency={cur} /> },
		{ label: "Orders (30d)", value: stats.orders },
		{ label: "To fulfil", value: stats.toFulfill },
		{ label: "Customers", value: stats.customers },
	];
	return (
		<>
			<PageHeader title="Overview" description="Last 30 days" />
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{tiles.map((t) => (
					<Card key={t.label} size="sm">
						<CardHeader><p className="text-xs text-muted-foreground">{t.label}</p></CardHeader>
						<CardContent><p className="text-xl font-semibold tabular-nums sm:text-2xl">{t.value}</p></CardContent>
					</Card>
				))}
			</div>

			{attention.length > 0 && (
				<Card className="mt-4 border-destructive/40">
					<CardHeader><CardTitle className="text-destructive">Payments need attention ({attention.length})</CardTitle></CardHeader>
					<CardContent className="text-sm text-muted-foreground">
						Captured payments that could not be turned into orders (amount mismatch, cart changed or duplicate payment). Review in the provider dashboard and refund if needed:
						<ul className="mt-2 space-y-1 font-mono text-xs">
							{attention.slice(0, 5).map((p) => <li key={p.id}>{p.provider} · {p.reference} · {p.failureReason} · <Money amount={p.amount} currency={p.currencyCode} /></li>)}
						</ul>
					</CardContent>
				</Card>
			)}

			<div className="mt-4 grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader><CardTitle>Sales</CardTitle></CardHeader>
					<CardContent>
						{stats.byDay.length ? (
							<div className="flex h-40 items-end gap-1" role="img" aria-label="Daily sales for the last 30 days">
								{stats.byDay.map((d) => (
									<div key={d.day} className="group relative flex-1">
										<div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(4, (d.total / max) * 160)}px` }} />
										<span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] whitespace-nowrap text-background group-hover:block">{d.day}: {d.n}</span>
									</div>
								))}
							</div>
						) : <p className="text-sm text-muted-foreground">No sales yet.</p>}
					</CardContent>
				</Card>
				<Card>
					<CardHeader><CardTitle>Low stock</CardTitle></CardHeader>
					<CardContent className="space-y-2 text-sm">
						{lowStock.length ? lowStock.map((i) => (
							<Link key={i.variantId} href={`/admin/products/${i.productId}`} className="flex justify-between gap-2 hover:underline">
								<span className="truncate">{i.productTitle}{i.variantTitle !== "Default" && ` · ${i.variantTitle}`}</span>
								<span className="tabular-nums text-muted-foreground">{i.stock ?? 0}</span>
							</Link>
						)) : <p className="text-muted-foreground">All good.</p>}
					</CardContent>
				</Card>
			</div>

			<Card className="mt-4">
				<CardHeader><CardTitle>Recent orders</CardTitle></CardHeader>
				<CardContent>
					{stats.recent.length ? (
						<ul className="divide-y">
							{stats.recent.map((o) => (
								<li key={o.id}>
									<Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-muted/50">
										<div className="min-w-0">
											<p className="font-medium">#{o.displayId} <span className="font-normal text-muted-foreground">{o.email}</span></p>
											<p className="text-xs text-muted-foreground">{dateTime(o.createdAt)}</p>
										</div>
										<div className="flex shrink-0 flex-col items-end gap-1">
											<Money amount={o.total} currency={o.currencyCode} className="font-medium" />
											<StatusBadge status={o.status} />
										</div>
									</Link>
								</li>
							))}
						</ul>
					) : <EmptyState title="No orders yet" description="Orders placed through the Store API will appear here." />}
				</CardContent>
			</Card>
		</>
	);
}
