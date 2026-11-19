import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { CheckboxField, Field, SelectField } from "@/components/app/field";
import { Money, PageHeader, StatusBadge, dateTime } from "@/components/app/ui-bits";
import { getOrderDetail } from "@/queries/admin";
import { imageUrl } from "@/modules/media/service";
import { formatMoney, toMajor } from "@/lib/money";
import { cancelOrderAction, fulfillmentAction, orderNoteAction, refundAction } from "../../actions";
import { AddressBlock } from "../address";

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const o = await getOrderDetail(id);
	if (!o) notFound();
	const payment = o.payments.find((p) => p.orderId === o.id);
	const refundable = payment ? payment.amount - payment.refundedAmount : 0;
	const row = (label: string, amount: number, neg = false) => (
		<div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span>{neg && amount ? "−" : ""}<Money amount={amount} currency={o.currencyCode} /></span></div>
	);

	return (
		<>
			<Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Orders</Link>
			<PageHeader
				eyebrow="Sales · Order"
				title={`Order #${o.displayId}`}
				description={dateTime(o.createdAt)}
				actions={<><StatusBadge status={o.status} /><StatusBadge status={o.paymentStatus} /><StatusBadge status={o.fulfillmentStatus} /></>}
			/>
			<div className="grid gap-4 lg:grid-cols-3">
				<div className="space-y-4 lg:col-span-2">
					<Card>
						<CardHeader><CardTitle>Items</CardTitle></CardHeader>
						<CardContent className="space-y-3">
							{o.items.map((i) => (
								<div key={i.id} className="flex items-center gap-3">
									<div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
										{/* eslint-disable-next-line @next/next/no-img-element */}
										{i.thumbnail && <img src={imageUrl(i.thumbnail, 128)!} alt="" className="size-full object-cover" />}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{i.productId ? <Link className="hover:underline" href={`/admin/products/${i.productId}`}>{i.title}</Link> : i.title}</p>
										<p className="text-xs text-muted-foreground">{i.variantTitle}{i.sku && ` · ${i.sku}`} · {i.quantity} × <Money amount={i.unitPrice} currency={o.currencyCode} /></p>
									</div>
									<Money amount={i.total} currency={o.currencyCode} className="text-sm" />
								</div>
							))}
							<div className="space-y-1 border-t pt-3">
								{row("Subtotal", o.subtotal)}
								{o.discountTotal > 0 && row(`Discount${o.promotion ? ` (${o.promotion.code})` : ""}`, o.discountTotal, true)}
								{row(`Shipping${o.shippingMethod ? ` · ${o.shippingMethod.name}` : ""}`, o.shippingTotal)}
								{o.taxTotal > 0 && row(o.taxInclusive ? "Tax (included)" : "Tax", o.taxTotal)}
								<div className="flex justify-between pt-1 font-semibold"><span>Total</span><Money amount={o.total} currency={o.currencyCode} /></div>
								{o.refundedTotal > 0 && row("Refunded", o.refundedTotal, true)}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader><CardTitle>Fulfillment</CardTitle></CardHeader>
						<CardContent>
							<ActionForm action={fulfillmentAction}>
								<input type="hidden" name="orderId" value={o.id} />
								<div className="grid gap-3 sm:grid-cols-3">
									<SelectField label="Status" name="status" defaultValue={o.fulfillmentStatus === "canceled" ? "not_fulfilled" : o.fulfillmentStatus}
										options={[{ value: "not_fulfilled", label: "Not fulfilled" }, { value: "fulfilled", label: "Packed" }, { value: "shipped", label: "Shipped" }, { value: "delivered", label: "Delivered" }]} />
									<Field label="Carrier" name="carrier" defaultValue={o.carrier ?? ""} placeholder="GIG, DHL…" />
									<Field label="Tracking #" name="trackingNumber" defaultValue={o.trackingNumber ?? ""} />
								</div>
								<SubmitButton disabled={o.status === "canceled"}>Update fulfillment</SubmitButton>
							</ActionForm>
						</CardContent>
					</Card>

					<Card>
						<CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
						<CardContent className="space-y-4">
							<ActionForm action={orderNoteAction} resetOnSuccess className="flex gap-2 space-y-0">
								<input type="hidden" name="orderId" value={o.id} />
								<input name="note" required maxLength={2000} placeholder="Add an internal note" className="h-10 flex-1 rounded-lg border bg-transparent px-3 text-sm" />
								<SubmitButton variant="outline">Add</SubmitButton>
							</ActionForm>
							<ol className="space-y-3 border-l pl-4">
								{o.events.map((e) => (
									<li key={e.id} className="text-sm">
										<p className="font-medium">{e.type === "note" ? String(e.data?.note ?? "") : e.type.replace(/[._]/g, " ")}</p>
										<p className="text-xs text-muted-foreground">{dateTime(e.createdAt)}{e.type !== "note" && e.data && Object.keys(e.data).length > 0 && ` · ${Object.entries(e.data).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")}`}</p>
									</li>
								))}
							</ol>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-4">
					<Card>
						<CardHeader><CardTitle>Customer</CardTitle></CardHeader>
						<CardContent className="space-y-3 text-sm">
							{o.customer ? <Link className="font-medium hover:underline" href={`/admin/customers/${o.customer.id}`}>{o.email}</Link> : <p>{o.email}</p>}
							<div><p className="mb-1 text-xs font-medium text-muted-foreground">Shipping address</p><AddressBlock a={o.shippingAddress} /></div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader><CardTitle>Payment</CardTitle></CardHeader>
						<CardContent className="space-y-3 text-sm">
							{payment ? (
								<>
									<p className="capitalize">{payment.provider} · <StatusBadge status={payment.status} /></p>
									<p className="break-all font-mono text-xs text-muted-foreground">{payment.reference}</p>
									{payment.refunds.map((r) => <p key={r.id} className="text-xs">Refund <Money amount={r.amount} currency={o.currencyCode} /> · {r.status}</p>)}
									{refundable > 0 && (
										<ActionForm action={refundAction} confirm="Issue this refund through the payment provider?">
											<input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="currency" value={o.currencyCode} />
											<Field label={`Refund amount (max ${formatMoney(refundable, o.currencyCode)})`} name="amount" inputMode="decimal" required defaultValue={String(toMajor(refundable, o.currencyCode))} />
											<Field label="Reason" name="reason" maxLength={300} />
											<SubmitButton variant="outline" className="w-full">Refund</SubmitButton>
										</ActionForm>
									)}
								</>
							) : <p className="text-muted-foreground">No payment record.</p>}
						</CardContent>
					</Card>

					{o.status !== "canceled" && !["shipped", "delivered"].includes(o.fulfillmentStatus) && (
						<Card>
							<CardHeader><CardTitle>Cancel order</CardTitle></CardHeader>
							<CardContent>
								<ActionForm action={cancelOrderAction} confirm="Cancel this order? Refunds are issued separately.">
									<input type="hidden" name="orderId" value={o.id} />
									<CheckboxField label="Return items to stock" name="restock" defaultChecked />
									<Button type="submit" variant="destructive" className="w-full">Cancel order</Button>
								</ActionForm>
							</CardContent>
						</Card>
					)}
				</div>
			</div>
		</>
	);
}
