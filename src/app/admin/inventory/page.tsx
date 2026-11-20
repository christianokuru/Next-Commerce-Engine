import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { PageHeader, EmptyState } from "@/components/app/ui-bits";
import { listInventory } from "@/queries/admin";
import { adjustStockAction } from "../actions";
import { hasFeature } from "@/lib/plan";
import { notFound } from "next/navigation";

export const metadata = { title: "Inventory" };

export default async function Inventory({ searchParams }: { searchParams: Promise<{ low?: string }> }) {
	if (!hasFeature("inventoryTracking")) notFound(); // not in this plan: the page doesn't exist
	const low = (await searchParams).low === "1";
	const rows = await listInventory({ lowStockOnly: low });
	return (
		<>
			<PageHeader
				eyebrow="Catalogue"
				title="Inventory"
				description="Single-location stock per variant. Every change is written to the stock ledger."
				actions={<Link href={low ? "/admin/inventory" : "/admin/inventory?low=1"} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">{low ? "Show all" : "Low stock only"}</Link>}
			/>
			{rows.length ? (
				<div>
					<ul className="ledger">
						{rows.map((r) => (
							<li key={r.variantId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
								<Link href={`/admin/products/${r.productId}`} className="min-w-0 flex-1 hover:underline">
									<p className="truncate font-heading text-lg leading-tight">{r.productTitle}</p>
									<p className="text-xs text-muted-foreground">{r.variantTitle} · {r.sku ?? "no SKU"}{!r.manageInventory && " · not tracked"}{r.allowBackorder && " · backorders"}</p>
								</Link>
								<span className={`numeral w-16 text-2xl ${r.stockedQuantity <= (r.lowStockThreshold ?? 5) ? "text-destructive" : ""}`}>{r.stockedQuantity}</span>
								<ActionForm action={adjustStockAction} className="flex items-center gap-2 space-y-0">
									<input type="hidden" name="variantId" value={r.variantId} />
									<select name="mode" className="h-9 rounded-lg border bg-transparent px-2 text-sm" aria-label="Mode"><option value="add">Add</option><option value="set">Set</option></select>
									<Input name="quantity" type="number" required className="h-9 w-20" aria-label="Quantity" />
									<SubmitButton size="sm" variant="outline" className="min-h-9">Apply</SubmitButton>
								</ActionForm>
							</li>
						))}
					</ul>
				</div>
			) : <EmptyState title={low ? "No low-stock items" : "No variants yet"} />}
		</>
	);
}
