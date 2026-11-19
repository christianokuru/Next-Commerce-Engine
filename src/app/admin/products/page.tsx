import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PageHeader, StatusBadge, EmptyState, Pagination } from "@/components/app/ui-bits";
import { listProducts, type ProductStatus } from "@/modules/product/service";
import { imageUrl } from "@/modules/media/service";

export const metadata = { title: "Products" };
const LIMIT = 20;

export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; offset?: string }> }) {
	const sp = await searchParams;
	const status = ["draft", "published", "archived"].includes(sp.status ?? "") ? (sp.status as ProductStatus) : undefined;
	const offset = Math.max(0, Number(sp.offset) || 0);
	const { products, count } = await listProducts({ q: sp.q?.slice(0, 100), status, limit: LIMIT, offset });
	return (
		<>
			<PageHeader title="Products" description={`${count} total`} actions={<Link href="/admin/products/new" className={buttonVariants({ className: "h-10" })}><Plus /> New product</Link>} />
			<form className="mb-4 flex gap-2">
				<Input name="q" defaultValue={sp.q} placeholder="Search products" className="h-10" />
				<select name="status" defaultValue={status ?? ""} className="h-10 rounded-lg border bg-transparent px-2 text-sm">
					<option value="">All</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option>
				</select>
			</form>
			{products.length ? (
				<Card className="p-0">
					<ul className="divide-y">
						{products.map((p) => {
							const stock = p.variants.reduce((s, v) => s + (v.inventory?.stockedQuantity ?? 0), 0);
							return (
								<li key={p.id}>
									<Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/50">
										<div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
											{/* eslint-disable-next-line @next/next/no-img-element */}
											{p.thumbnail && <img src={imageUrl(p.thumbnail, 128)!} alt="" className="size-full object-cover" loading="lazy" />}
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium">{p.title}</p>
											<p className="text-xs text-muted-foreground">{p.variants.length} variant{p.variants.length === 1 ? "" : "s"} · {stock} in stock</p>
										</div>
										<StatusBadge status={p.status} />
									</Link>
								</li>
							);
						})}
					</ul>
				</Card>
			) : (
				<EmptyState title="No products" description="Create your first product to start selling." action={<Link href="/admin/products/new" className={buttonVariants()}>New product</Link>} />
			)}
			<Pagination total={count} limit={LIMIT} offset={offset} basePath="/admin/products" params={{ q: sp.q, status }} />
		</>
	);
}
