import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusBadge, EmptyState, Pagination, Plate, FilterBar } from "@/components/app/ui-bits";
import { listProductsWithStock } from "@/queries/admin";
import type { ProductStatus } from "@/modules/product/service";
import { imageUrl } from "@/modules/media/service";

export const metadata = { title: "Products" };
const LIMIT = 20;

export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; offset?: string }> }) {
	const sp = await searchParams;
	const status = ["draft", "published", "archived"].includes(sp.status ?? "") ? (sp.status as ProductStatus) : undefined;
	const offset = Math.max(0, Number(sp.offset) || 0);
	const { products, count } = await listProductsWithStock({ q: sp.q?.slice(0, 100), status, limit: LIMIT, offset });
	return (
		<>
			<PageHeader eyebrow="Catalogue" title="Products" description={`${count} products in the catalogue.`} actions={<Link href="/admin/products/new" className={buttonVariants({ className: "h-10" })}><Plus /> New product</Link>} />
			<FilterBar>
				<Input name="q" defaultValue={sp.q} placeholder="Search products" />
				<select name="status" defaultValue={status ?? ""} className="rounded-lg border border-input bg-transparent px-2 text-sm sm:w-40">
					<option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option>
				</select>
			</FilterBar>
			{products.length ? (
				<ul className="ledger">
					{products.map((p) => (
						<li key={p.id}>
							<Link href={`/admin/products/${p.id}`} className="flex items-center gap-4 py-3 hover:bg-muted/50">
								<Plate src={imageUrl(p.thumbnail, 128)} className="size-14" />
								<div className="min-w-0 flex-1">
									<p className="truncate font-heading text-lg leading-tight">{p.title}</p>
									<p className="text-xs text-muted-foreground">{p.variants.length} variant{p.variants.length === 1 ? "" : "s"} · {p.stock} in stock</p>
								</div>
								<StatusBadge status={p.status} />
							</Link>
						</li>
					))}
				</ul>
			) : (
				<EmptyState title="No products" description="Create your first product to start selling." action={<Link href="/admin/products/new" className={buttonVariants()}>New product</Link>} />
			)}
			<Pagination total={count} limit={LIMIT} offset={offset} basePath="/admin/products" params={{ q: sp.q, status }} />
		</>
	);
}
