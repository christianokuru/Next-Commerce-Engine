import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { Field } from "@/components/app/field";
import { PageHeader, EmptyState } from "@/components/app/ui-bits";
import { listCollections } from "@/modules/product/service";
import { createCollectionAction, deleteCollectionAction } from "../actions";
import { hasFeature } from "@/lib/plan";
import { notFound } from "next/navigation";

export const metadata = { title: "Collections" };

export default async function Collections() {
	if (!hasFeature("collections")) notFound(); // not in this plan: the page doesn't exist
	const cols = await listCollections();
	return (
		<>
			<PageHeader eyebrow="Catalogue" title="Collections" description="Curated groups like “Summer Sale” or “New Arrivals”." />
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2 p-0">
					{cols.length ? (
						<ul className="divide-y">
							{cols.map((c) => (
								<li key={c.id} className="flex items-center gap-3 p-3">
									<div className="min-w-0 flex-1">
										<p className="font-medium">{c.title}</p>
										<p className="text-xs text-muted-foreground">/{c.handle} · {c.productCount} products</p>
									</div>
									<ActionForm action={deleteCollectionAction} confirm={`Delete ${c.title}? Products stay.`} className="space-y-0">
										<input type="hidden" name="id" value={c.id} />
										<Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>
									</ActionForm>
								</li>
							))}
						</ul>
					) : <div className="p-4"><EmptyState title="No collections yet" description="Assign products to a collection from the product page." /></div>}
				</Card>
				<Card className="h-fit">
					<CardHeader><CardTitle>New collection</CardTitle></CardHeader>
					<CardContent>
						<ActionForm action={createCollectionAction} resetOnSuccess>
							<Field label="Title" name="title" required maxLength={100} />
							<Field label="Description" name="description" maxLength={1000} />
							<SubmitButton className="w-full">Create</SubmitButton>
						</ActionForm>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
