import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money, PageHeader, StatusBadge, dateTime } from "@/components/app/ui-bits";
import { requireCustomer } from "@/server/session";
import { getCustomerOrder } from "@/modules/order/service";
import { imageUrl } from "@/modules/media/service";
import { AddressBlock } from "@/app/admin/orders/address";
import { cn } from "@/lib/utils";

export const metadata = { title: "Order" };
const STEPS = ["not_fulfilled", "fulfilled", "shipped", "delivered"] as const;
const LABEL: Record<string, string> = { not_fulfilled: "Placed", fulfilled: "Packed", shipped: "Shipped", delivered: "Delivered" };

export default async function MyOrder({ params }: { params: Promise<{ id: string }> }) {
	const { customer } = await requireCustomer();
	const o = await getCustomerOrder(customer.id, (await params).id); // scoped: no IDOR
	if (!o) notFound();
	const step = STEPS.indexOf(o.fulfillmentStatus as (typeof STEPS)[number]);
	return (
		<>
			<Link href="/account/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Orders</Link>
			<PageHeader title={`Order #${o.displayId}`} description={dateTime(o.createdAt)} actions={o.status === "canceled" ? <StatusBadge status="canceled" /> : undefined} />
			{o.status !== "canceled" && (
				<Card className="mb-4">
					<CardContent>
						<ol className="grid grid-cols-4 gap-2">
							{STEPS.map((s, i) => (
								<li key={s} className="flex flex-col items-center gap-1 text-center text-xs">
									<span className={cn("flex size-7 items-center justify-center rounded-full border", i <= step && "border-primary bg-primary text-primary-foreground")}>{i <= step ? <Check className="size-4" /> : i + 1}</span>
									{LABEL[s]}
								</li>
							))}
						</ol>
						{o.trackingNumber && <p className="mt-4 text-center text-sm">Tracking: <strong>{o.carrier} {o.trackingNumber}</strong></p>}
					</CardContent>
				</Card>
			)}
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader><CardTitle>Items</CardTitle></CardHeader>
					<CardContent className="space-y-3">
						{o.items.map((i) => (
							<div key={i.id} className="flex items-center gap-3">
								<div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									{i.thumbnail && <img src={imageUrl(i.thumbnail, 128)!} alt="" className="size-full object-cover" />}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{i.title}</p>
									<p className="text-xs text-muted-foreground">{i.variantTitle !== "Default" && `${i.variantTitle} · `}Qty {i.quantity}</p>
								</div>
								<Money amount={i.total} currency={o.currencyCode} className="text-sm" />
							</div>
						))}
						<div className="space-y-1 border-t pt-3 text-sm">
							<div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><Money amount={o.subtotal} currency={o.currencyCode} /></div>
							{o.discountTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>−<Money amount={o.discountTotal} currency={o.currencyCode} /></span></div>}
							<div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><Money amount={o.shippingTotal} currency={o.currencyCode} /></div>
							{o.taxTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{o.taxInclusive ? "Tax (included)" : "Tax"}</span><Money amount={o.taxTotal} currency={o.currencyCode} /></div>}
							<div className="flex justify-between pt-1 font-semibold"><span>Total</span><Money amount={o.total} currency={o.currencyCode} /></div>
							{o.refundedTotal > 0 && <div className="flex justify-between text-muted-foreground"><span>Refunded</span><Money amount={o.refundedTotal} currency={o.currencyCode} /></div>}
						</div>
					</CardContent>
				</Card>
				<Card className="h-fit">
					<CardHeader><CardTitle>Delivery</CardTitle></CardHeader>
					<CardContent className="space-y-2">
						<AddressBlock a={o.shippingAddress} />
						{o.shippingMethod && <p className="text-sm text-muted-foreground">{o.shippingMethod.name}</p>}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
