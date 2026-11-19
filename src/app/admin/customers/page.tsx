import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, Pagination, dateOnly } from "@/components/app/ui-bits";
import { listCustomers } from "@/modules/customer/service";

export const metadata = { title: "Customers" };
const LIMIT = 25;

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string }> }) {
	const sp = await searchParams;
	const offset = Math.max(0, Number(sp.offset) || 0);
	const { customers, count } = await listCustomers({ q: sp.q?.slice(0, 100), limit: LIMIT, offset });
	return (
		<>
			<PageHeader eyebrow="People" title="Customers" description={`${count} customers`} />
			<form className="mb-4"><Input name="q" defaultValue={sp.q} placeholder="Search by name or email" className="h-10" /></form>
			{customers.length ? (
				<Card className="p-0">
					<ul className="divide-y">
						{customers.map((c) => (
							<li key={c.id}>
								<Link href={`/admin/customers/${c.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50">
									<div className="min-w-0">
										<p className="truncate font-medium">{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}</p>
										<p className="truncate text-xs text-muted-foreground">{c.email} · since {dateOnly(c.createdAt)}</p>
									</div>
									<Badge variant={c.userId ? "default" : "outline"}>{c.userId ? "Account" : "Guest"}</Badge>
								</Link>
							</li>
						))}
					</ul>
				</Card>
			) : <EmptyState title="No customers yet" />}
			<Pagination total={count} limit={LIMIT} offset={offset} basePath="/admin/customers" params={{ q: sp.q }} />
		</>
	);
}
