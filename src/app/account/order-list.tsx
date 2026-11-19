import Link from "next/link";
import { Money, StatusBadge, dateOnly } from "@/components/app/ui-bits";
import type { Order } from "@/modules/order/service";

export function OrderList({ orders }: { orders: Order[] }) {
	return (
		<ul className="divide-y">
			{orders.map((o) => (
				<li key={o.id}>
					<Link href={`/account/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50">
						<div>
							<p className="font-medium">Order #{o.displayId}</p>
							<p className="text-xs text-muted-foreground">{dateOnly(o.createdAt)}</p>
						</div>
						<div className="flex flex-col items-end gap-1">
							<Money amount={o.total} currency={o.currencyCode} className="text-sm font-medium" />
							<StatusBadge status={o.status === "canceled" ? "canceled" : o.fulfillmentStatus} />
						</div>
					</Link>
				</li>
			))}
		</ul>
	);
}
