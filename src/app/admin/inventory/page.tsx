import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { PageHeader, EmptyState } from "@/components/app/ui-bits";
import { listInventory } from "@/modules/inventory/service";
import { adjustStockAction } from "../actions";

export const metadata = { title: "Inventory" };

export default async function Inventory({ searchParams }: { searchParams: Promise<{ low?: string }> }) {
	const low = (await searchParams).low === "1";
	const rows = await listInventory({ lowStockOnly: low });
	return (
		<>
			<PageHeader
				title="Inventory"
				description="Single-location stock per variant. Every change is written to the stock ledger."
				actions={<Link href={low ? "/admin/inventory" : "/admin/inventory?low=1"} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">{low ? "Show all" : "Low stock only"}</Link>}
			/>
			{rows.length ? (
				<Card className="p-0">
					<ul className="divide-y">
						{rows.map((r) => (
							<li key={r.variantId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
								<Link href={`/admin/products/${r.productId}`} className="min-w-0 flex-1 hover:underline">
									<p className="truncate font-medium">{r.productTitle}</p>
									<p className="text-xs text-muted-foreground">{r.variantTitle} · {r.sku ?? "no SKU"}{!r.manageInventory && " · not tracked"}{r.allowBackorder && " · backorders"}</p>
								</Link>
								<span className={`w-16 text-sm tabular-nums ${(r.stock ?? 0) <= (r.lowStockThreshold ?? 5) ? "text-destructive" : ""}`}>{r.stock ?? 0}</span>
								<ActionForm action={adjustStockAction} className="flex items-center gap-2 space-y-0">
									<input type="hidden" name="variantId" value={r.variantId} />
									<select name="mode" className="h-9 rounded-lg border bg-transparent px-2 text-sm" aria-label="Mode"><option value="add">Add</option><option value="set">Set</option></select>
									<Input name="quantity" type="number" required className="h-9 w-20" aria-label="Quantity" />
									<SubmitButton size="sm" variant="outline" className="min-h-9">Apply</SubmitButton>
								</ActionForm>
							</li>
						))}
					</ul>
				</Card>
			) : <EmptyState title={low ? "No low-stock items" : "No variants yet"} />}
		</>
	);
}
