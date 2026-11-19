import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Money, StatusBadge, Stat, EmptyState, dateTime, dateOnly } from "@/components/app/ui-bits";
import { dashboard } from "@/queries/admin";
import { getSettings } from "@/modules/store/service";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Overview() {
	const [d, settings] = await Promise.all([dashboard(30), getSettings()]);
	const cur = d.revenueCurrency ?? settings.defaultCurrency;
	const max = Math.max(1, ...d.byDay.map((x) => x.total));
	const aov = d.orders ? Math.round(d.revenue / d.orders) : 0;

	return (
		<>
			{/* Front page */}
			<section className="border-b border-rule pb-8">
				<p className="eyebrow">The last 30 days · {dateOnly(new Date())}</p>
				<h1 className="display mt-3 text-5xl sm:text-7xl">{formatMoney(d.revenue, cur)}</h1>
				<p className="mt-4 max-w-2xl text-pretty font-heading text-lg leading-snug text-muted-foreground sm:text-xl">
					{d.orders ? (
						<>{d.orders} order{d.orders === 1 ? "" : "s"} placed this month, averaging {formatMoney(aov, cur)}. <span className="text-foreground">{d.toFulfill} {d.toFulfill === 1 ? "is" : "are"} waiting to be packed.</span></>
					) : "No orders yet — your first sale will appear here."}
				</p>
			</section>

			<section className="grid grid-cols-2 border-b border-rule sm:grid-cols-4 sm:divide-x sm:divide-border [&>*]:sm:pl-5 [&>*:first-child]:sm:pl-0">
				<Stat label="Revenue" value={<Money amount={d.revenue} currency={cur} />} note="net of refunds" />
				<Stat label="Orders" value={d.orders} note="last 30 days" />
				<Stat label="To fulfil" value={d.toFulfill} note={<Link href="/admin/orders" className="hover:underline">open queue →</Link>} />
				<Stat label="Customers" value={d.customers} note="all time" />
			</section>

			{d.attention.length > 0 && (
				<section className="mt-8 border-l-2 border-destructive pl-4">
					<p className="eyebrow text-destructive">Requires attention · {d.attention.length}</p>
					<p className="mt-1 text-sm text-muted-foreground">Captured payments that could not become orders (amount mismatch, cart changed or duplicate). Review in the provider dashboard and refund if needed.</p>
					<ul className="mt-2 space-y-1 font-mono text-xs">
						{d.attention.slice(0, 5).map((p) => <li key={p.id}>{p.provider} · {p.reference} · {p.failureReason} · <Money amount={p.amount} currency={p.currencyCode} /></li>)}
					</ul>
				</section>
			)}

			<div className="mt-10 grid gap-10 lg:grid-cols-[1fr_18rem]">
				<section>
					<div className="flex items-baseline justify-between border-t border-rule pt-3">
						<h2 className="font-heading text-2xl">Daily sales</h2>
						<span className="eyebrow">{cur}</span>
					</div>
					{d.byDay.length ? (
						<div className="mt-6">
							<div className="flex h-48 items-end gap-[3px]" role="img" aria-label="Daily sales for the last 30 days">
								{d.byDay.map((x) => (
									<div key={x.day} className="group relative flex h-full flex-1 items-end">
										<div className="w-full bg-brand/85 transition-colors group-hover:bg-brand" style={{ height: `${Math.max(3, (x.total / max) * 100)}%` }} />
										<span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
											{x.day} · {formatMoney(x.total, cur)} · {x.n}
										</span>
									</div>
								))}
							</div>
							<div className="mt-2 flex justify-between border-t border-rule pt-1.5 text-[11px] tabular-nums text-muted-foreground">
								<span>{d.byDay[0].day}</span><span>{d.byDay[d.byDay.length - 1].day}</span>
							</div>
						</div>
					) : <p className="mt-4 text-sm text-muted-foreground">No sales yet.</p>}
				</section>

				<aside>
					<div className="flex items-baseline justify-between border-t border-rule pt-3">
						<h2 className="font-heading text-2xl">Running low</h2>
						<Link href="/admin/inventory?low=1" className="eyebrow hover:text-foreground">All</Link>
					</div>
					<ul className="mt-3 text-sm">
						{d.lowStock.length ? d.lowStock.map((i) => (
							<li key={i.variantId} className="border-b border-border">
								<Link href={`/admin/products/${i.productId}`} className="flex items-baseline justify-between gap-3 py-2.5 hover:text-brand">
									<span className="truncate">{i.productTitle}{i.variantTitle !== "Default" && <span className="text-muted-foreground"> · {i.variantTitle}</span>}</span>
									<span className="numeral text-lg">{i.stockedQuantity}</span>
								</Link>
							</li>
						)) : <li className="py-2.5 text-muted-foreground">Every item is well stocked.</li>}
					</ul>
				</aside>
			</div>

			<section className="mt-12">
				<div className="flex items-baseline justify-between border-t border-rule pt-3">
					<h2 className="font-heading text-2xl">Latest orders</h2>
					<Link href="/admin/orders" className="eyebrow inline-flex items-center gap-1 hover:text-foreground">View all <ArrowUpRight className="size-3" /></Link>
				</div>
				{d.recent.length ? (
					<ul className="mt-2">
						{d.recent.map((o) => (
							<li key={o.id} className="border-b border-border">
								<Link href={`/admin/orders/${o.id}`} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-1 py-3.5 hover:bg-muted/50 sm:grid-cols-[5rem_1fr_9rem_8rem_7rem]">
									<span className="numeral text-lg">#{o.displayId}</span>
									<span className="truncate text-sm">{o.email}</span>
									<span className="hidden text-xs text-muted-foreground sm:block">{dateTime(o.createdAt)}</span>
									<span className="hidden sm:block"><StatusBadge status={o.status === "pending" ? o.fulfillmentStatus : o.status} /></span>
									<Money amount={o.total} currency={o.currencyCode} className="text-right text-sm font-medium" />
								</Link>
							</li>
						))}
					</ul>
				) : <EmptyState title="No orders yet" description="Orders placed through the Store API will appear here." />}
			</section>
		</>
	);
}
