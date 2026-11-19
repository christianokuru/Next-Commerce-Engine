import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money, PageHeader, StatusBadge, dateTime } from "@/components/app/ui-bits";
import { getCustomerDetail } from "@/queries/admin";
import { AddressBlock } from "../../orders/address";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
	const c = await getCustomerDetail((await params).id);
	if (!c) notFound();
	const spent = c.orders.filter((o) => o.status !== "canceled").reduce<Record<string, number>>((m, o) => ({ ...m, [o.currencyCode]: (m[o.currencyCode] ?? 0) + o.total - o.refundedTotal }), {});
	return (
		<>
			<Link href="/admin/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Customers</Link>
			<PageHeader eyebrow="People · Customer" title={[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email} description={c.email} />
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader><CardTitle>Orders ({c.orders.length})</CardTitle></CardHeader>
					<CardContent>
						<ul className="divide-y">
							{c.orders.map((o) => (
								<li key={o.id}>
									<Link href={`/admin/orders/${o.id}`} className="flex justify-between gap-3 py-3 text-sm hover:bg-muted/50">
										<span>#{o.displayId} · <span className="text-muted-foreground">{dateTime(o.createdAt)}</span></span>
										<span className="flex items-center gap-2"><Money amount={o.total} currency={o.currencyCode} /><StatusBadge status={o.status} /></span>
									</Link>
								</li>
							))}
						</ul>
						{!c.orders.length && <p className="text-sm text-muted-foreground">No orders.</p>}
					</CardContent>
				</Card>
				<div className="space-y-4">
					<Card>
						<CardHeader><CardTitle>Summary</CardTitle></CardHeader>
						<CardContent className="space-y-1 text-sm">
							<p>{c.userId ? "Registered account" : "Guest checkout"}</p>
							{c.phone && <p>{c.phone}</p>}
							{Object.entries(spent).map(([cur, amt]) => <p key={cur}>Lifetime: <Money amount={amt} currency={cur} /></p>)}
						</CardContent>
					</Card>
					<Card>
						<CardHeader><CardTitle>Addresses</CardTitle></CardHeader>
						<CardContent className="space-y-3">
							{c.addresses.length ? c.addresses.map((a) => <AddressBlock key={a.id} a={a.address} />) : <p className="text-sm text-muted-foreground">None saved.</p>}
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
