import { Field, SelectField, TextareaField } from "@/components/app/field";
import type { listCategories, listCollections } from "@/modules/product/service";

type Props = {
	categories: Awaited<ReturnType<typeof listCategories>>;
	collections: Awaited<ReturnType<typeof listCollections>>;
	defaults?: { title?: string; handle?: string; subtitle?: string | null; description?: string | null; status?: string; collectionId?: string | null; categoryIds?: string[] };
};

export function ProductFields({ categories, collections, defaults = {} }: Props) {
	return (
		<>
			<Field label="Title" name="title" required maxLength={200} defaultValue={defaults.title} />
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Handle" name="handle" maxLength={100} defaultValue={defaults.handle} hint="URL slug; generated from the title if empty" />
				<Field label="Subtitle" name="subtitle" maxLength={200} defaultValue={defaults.subtitle ?? ""} />
			</div>
			<TextareaField label="Description" name="description" rows={5} maxLength={10000} defaultValue={defaults.description ?? ""} />
			<div className="grid gap-4 sm:grid-cols-2">
				<SelectField label="Status" name="status" defaultValue={defaults.status ?? "draft"} options={[{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }]} />
				<SelectField label="Collection" name="collectionId" defaultValue={defaults.collectionId ?? ""} options={[{ value: "", label: "None" }, ...collections.map((c) => ({ value: c.id, label: c.title }))]} />
			</div>
			{categories.length > 0 && (
				<fieldset className="grid gap-2">
					<legend className="mb-1 text-sm font-medium">Categories</legend>
					<div className="flex flex-wrap gap-2">
						{categories.map((c) => (
							<label key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-muted">
								<input type="checkbox" name="categoryIds" value={c.id} defaultChecked={defaults.categoryIds?.includes(c.id)} className="size-4 accent-primary" />
								{c.name}
							</label>
						))}
					</div>
				</fieldset>
			)}
		</>
	);
}
