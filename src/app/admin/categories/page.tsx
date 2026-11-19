import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { Field, SelectField } from "@/components/app/field";
import { PageHeader, EmptyState } from "@/components/app/ui-bits";
import { listCategories } from "@/modules/product/service";
import { createCategoryAction, deleteCategoryAction, toggleCategoryAction } from "../actions";

export const metadata = { title: "Categories" };

export default async function Categories() {
	const cats = await listCategories();
	const name = new Map(cats.map((c) => [c.id, c.name]));
	return (
		<>
			<PageHeader eyebrow="Catalogue" title="Categories" description="Hierarchical product taxonomy exposed via the Store API." />
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2 p-0">
					{cats.length ? (
						<ul className="divide-y">
							{cats.map((c) => (
								<li key={c.id} className="flex items-center gap-3 p-3">
									<div className="min-w-0 flex-1">
										<p className="font-medium">{c.name} {!c.isActive && <span className="text-xs text-muted-foreground">(hidden)</span>}</p>
										<p className="text-xs text-muted-foreground">/{c.handle}{c.parentId && ` · in ${name.get(c.parentId)}`}</p>
									</div>
									<ActionForm action={toggleCategoryAction} className="space-y-0">
										<input type="hidden" name="id" value={c.id} /><input type="hidden" name="isActive" value={String(!c.isActive)} />
										<Button type="submit" variant="outline" size="sm">{c.isActive ? "Hide" : "Show"}</Button>
									</ActionForm>
									<ActionForm action={deleteCategoryAction} confirm={`Delete ${c.name}?`} className="space-y-0">
										<input type="hidden" name="id" value={c.id} />
										<Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>
									</ActionForm>
								</li>
							))}
						</ul>
					) : <div className="p-4"><EmptyState title="No categories yet" /></div>}
				</Card>
				<Card className="h-fit">
					<CardHeader><CardTitle>New category</CardTitle></CardHeader>
					<CardContent>
						<ActionForm action={createCategoryAction} resetOnSuccess>
							<Field label="Name" name="name" required maxLength={100} />
							<Field label="Description" name="description" maxLength={1000} />
							<SelectField label="Parent" name="parentId" options={[{ value: "", label: "None (top level)" }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
							<SubmitButton className="w-full">Create</SubmitButton>
						</ActionForm>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
