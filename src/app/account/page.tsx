import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/app/ui-bits";
import { requireCustomer } from "@/server/session";
import { listOrders } from "@/modules/order/service";
import { OrderList } from "./order-list";

export default async function AccountHome() {
	const { user, customer } = await requireCustomer();
	const { orders, count } = await listOrders({ customerId: customer.id, limit: 5 });
	return (
		<>
			<PageHeader title={`Hi, ${customer.firstName ?? user.name.split(" ")[0]}`} description={`${count} order${count === 1 ? "" : "s"} so far`} />
			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<CardTitle>Recent orders</CardTitle>
					{count > 5 && <Link href="/account/orders" className="text-sm underline">View all</Link>}
				</CardHeader>
				<CardContent>{orders.length ? <OrderList orders={orders} /> : <EmptyState title="No orders yet" description="Orders you place will show up here." />}</CardContent>
			</Card>
		</>
	);
}
