import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money, PageHeader, StatusBadge, EmptyState, Pagination, dateTime } from "@/components/app/ui-bits";
import { listOrders, type Order } from "@/modules/order/service";
import { ORDER_STATUS } from "@/modules/order/schema";

export const metadata = { title: "Orders" };
const LIMIT = 25;

export default async function Orders({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; offset?: string }> }) {
	const sp = await searchParams;
	const status = (ORDER_STATUS as readonly string[]).includes(sp.status ?? "") ? (sp.status as Order["status"]) : undefined;
	const offset = Math.max(0, Number(sp.offset) || 0);
	const { orders, count } = await listOrders({ q: sp.q?.slice(0, 100), status, limit: LIMIT, offset });
	return (
		<>
			<PageHeader title="Orders" description={`${count} orders`} />
			<form className="mb-4 flex gap-2">
				<Input name="q" defaultValue={sp.q} placeholder="Order # or email" className="h-10" />
				<select name="status" defaultValue={status ?? ""} className="h-10 rounded-lg border bg-transparent px-2 text-sm">
					<option value="">All</option>
					{ORDER_STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
				</select>
			</form>
			{orders.length ? (
				<Card className="p-0">
					<ul className="divide-y">
						{orders.map((o) => (
							<li key={o.id}>
								<Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50">
									<div className="min-w-0">
										<p className="font-medium">#{o.displayId} <span className="font-normal text-muted-foreground">{o.email}</span></p>
										<p className="text-xs text-muted-foreground">{dateTime(o.createdAt)}</p>
									</div>
									<div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
										<Money amount={o.total} currency={o.currencyCode} className="font-medium" />
										<StatusBadge status={o.status} />
										<span className="hidden sm:inline"><StatusBadge status={o.fulfillmentStatus} /></span>
									</div>
								</Link>
							</li>
						))}
					</ul>
				</Card>
			) : <EmptyState title="No orders found" />}
			<Pagination total={count} limit={LIMIT} offset={offset} basePath="/admin/orders" params={{ q: sp.q, status }} />
		</>
	);
}
