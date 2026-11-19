import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader, Pagination } from "@/components/app/ui-bits";
import { requireCustomer } from "@/server/session";
import { listOrders } from "@/modules/order/service";
import { OrderList } from "../order-list";

export const metadata = { title: "Orders" };
const LIMIT = 20;

export default async function MyOrders({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
	const { customer } = await requireCustomer();
	const offset = Math.max(0, Number((await searchParams).offset) || 0);
	const { orders, count } = await listOrders({ customerId: customer.id, limit: LIMIT, offset });
	return (
		<>
			<PageHeader title="Orders" />
			<Card><CardContent>{orders.length ? <OrderList orders={orders} /> : <EmptyState title="No orders yet" />}</CardContent></Card>
			<Pagination total={count} limit={LIMIT} offset={offset} basePath="/account/orders" />
		</>
	);
}
