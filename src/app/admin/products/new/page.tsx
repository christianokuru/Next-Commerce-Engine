import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { Field } from "@/components/app/field";
import { PageHeader } from "@/components/app/ui-bits";
import { listCategories, listCollections } from "@/modules/product/service";
import { getSettings } from "@/modules/store/service";
import { createProductAction } from "../../actions";
import { ProductFields } from "../product-fields";

export const metadata = { title: "New product" };

export default async function NewProduct() {
	const [categories, collections, settings] = await Promise.all([listCategories(), listCollections(), getSettings()]);
	return (
		<>
			<PageHeader title="New product" description="Start with a single variant; add options and more variants after saving." />
			<ActionForm action={createProductAction} className="grid gap-4 lg:grid-cols-3 lg:space-y-0">
				<Card className="lg:col-span-2">
					<CardContent className="space-y-4"><ProductFields categories={categories} collections={collections} /></CardContent>
				</Card>
				<Card className="h-fit">
					<CardHeader><CardTitle>Pricing & stock</CardTitle></CardHeader>
					<CardContent className="space-y-4">
						{settings.currencies.map((c) => (
							<Field key={c} label={`Price (${c})`} name={`price_${c}`} inputMode="decimal" placeholder="0.00" required={c === settings.defaultCurrency} />
						))}
						<Field label="SKU" name="sku" maxLength={64} />
						<Field label="Stock" name="stock" type="number" min={0} defaultValue={0} />
						<SubmitButton className="w-full">Create product</SubmitButton>
					</CardContent>
				</Card>
			</ActionForm>
		</>
	);
}
