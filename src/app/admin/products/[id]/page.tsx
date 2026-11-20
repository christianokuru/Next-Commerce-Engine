import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Trash2, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/app/action-form";
import { CheckboxField, Field, TextareaField } from "@/components/app/field";
import { Money, PageHeader, StatusBadge } from "@/components/app/ui-bits";
import { listCategories, listCollections } from "@/modules/product/service";
import { getProductDetail } from "@/queries/admin";
import { getSettings } from "@/modules/store/service";
import { imageUrl } from "@/modules/media/service";
import { toMajor } from "@/lib/money";
import {
	updateProductAction, deleteProductAction, setOptionsAction, addVariantAction, updateVariantAction,
	deleteVariantAction, deleteImageAction, setThumbnailAction,
} from "../../actions";
import { ProductFields } from "../product-fields";
import { ImageUploader } from "../image-uploader";
import { hasFeature } from "@/lib/plan";

export const metadata = { title: "Edit product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
	const tracking = hasFeature("inventoryTracking");
	const { id } = await params;
	const [product, categories, collections, settings] = await Promise.all([getProductDetail(id), listCategories(), listCollections(), getSettings()]);
	if (!product) notFound();
	const priceOf = (v: (typeof product.variants)[number], c: string) => v.prices.find((p) => p.currencyCode === c);

	return (
		<>
			<Link href="/admin/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Products</Link>
			<PageHeader eyebrow="Catalogue · Product" title={product.title} description={product.subtitle ?? undefined} actions={<StatusBadge status={product.status} />} />

			<div className="grid gap-4 lg:grid-cols-3">
				<div className="space-y-4 lg:col-span-2">
					<Card>
						<CardHeader><CardTitle>Details</CardTitle></CardHeader>
						<CardContent>
							<ActionForm action={updateProductAction}>
								<input type="hidden" name="id" value={product.id} />
								<ProductFields
									categories={categories}
									collections={collections}
									defaults={{ ...product, categoryIds: product.categoryLinks.map((l) => l.categoryId) }}
								/>
								<SubmitButton>Save details</SubmitButton>
							</ActionForm>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Variants</CardTitle>
							<CardDescription>Prices are in major units (e.g. 2500.00). Stock edits are recorded in the inventory ledger.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{product.variants.map((v) => (
								<details key={v.id} className="group border-b border-border last:border-b-0">
									<summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3">
										<div className="min-w-0">
											<p className="truncate font-medium">{v.title}</p>
											<p className="text-xs text-muted-foreground">{v.sku ?? "No SKU"} · {(v.inventory?.manageInventory ?? true) && tracking ? `${v.inventory?.stockedQuantity ?? 0} in stock` : "Always available"}</p>
										</div>
										<div className="text-right text-sm">
											{priceOf(v, settings.defaultCurrency) ? <Money amount={priceOf(v, settings.defaultCurrency)!.amount} currency={settings.defaultCurrency} /> : <span className="text-destructive">No price</span>}
										</div>
									</summary>
									<div className="pb-4">
										<ActionForm action={updateVariantAction}>
											<input type="hidden" name="variantId" value={v.id} />
											<div className="grid gap-3 sm:grid-cols-3">
												<Field label="Title" name="title" defaultValue={v.title} required />
												<Field label="SKU" name="sku" defaultValue={v.sku ?? ""} />
												{tracking && <Field label="Stock" name="stock" type="number" min={0} defaultValue={v.inventory?.stockedQuantity ?? 0} />}
											</div>
											<div className="grid gap-3 sm:grid-cols-2">
												{settings.currencies.map((c) => (
													<div key={c} className="grid grid-cols-2 gap-2">
														<Field label={`Price ${c}`} name={`price_${c}`} inputMode="decimal" defaultValue={priceOf(v, c) ? String(toMajor(priceOf(v, c)!.amount, c)) : ""} />
														<Field label={`Compare-at ${c}`} name={`compare_${c}`} inputMode="decimal" defaultValue={priceOf(v, c)?.compareAtAmount ? String(toMajor(priceOf(v, c)!.compareAtAmount!, c)) : ""} />
													</div>
												))}
											</div>
											{tracking && (
												<div className="flex flex-wrap gap-4">
													<CheckboxField label="Track inventory" name="manageInventory" defaultChecked={v.inventory?.manageInventory ?? true} />
													<CheckboxField label="Allow backorders" name="allowBackorder" defaultChecked={v.inventory?.allowBackorder ?? false} />
												</div>
											)}
											<SubmitButton size="sm">Save variant</SubmitButton>
										</ActionForm>
										<ActionForm action={deleteVariantAction} confirm="Delete this variant?" className="mt-3">
											<input type="hidden" name="variantId" value={v.id} />
											<Button type="submit" variant="destructive" size="sm"><Trash2 /> Delete variant</Button>
										</ActionForm>
									</div>
								</details>
							))}

							<details className="rounded-lg border border-dashed">
								<summary className="cursor-pointer list-none p-3 text-sm font-medium">+ Add variant</summary>
								<div className="border-t p-3">
									<ActionForm action={addVariantAction} resetOnSuccess>
										<input type="hidden" name="productId" value={product.id} />
										{product.options.length > 0 && (
											<div className="grid gap-3 sm:grid-cols-3">
												{product.options.map((o) => (
													<div key={o.id} className="grid gap-1.5">
														<label className="text-sm font-medium" htmlFor={`opt_${o.title}`}>{o.title}</label>
														<select id={`opt_${o.title}`} name={`opt_${o.title}`} className="h-10 rounded-lg border bg-transparent px-2 text-sm">
															{o.values.map((val) => <option key={val}>{val}</option>)}
														</select>
													</div>
												))}
											</div>
										)}
										<div className="grid gap-3 sm:grid-cols-3">
											<Field label="Title" name="title" placeholder="Auto from options" />
											<Field label="SKU" name="sku" />
											{tracking && <Field label="Stock" name="stock" type="number" min={0} defaultValue={0} />}
										</div>
										<div className="grid gap-3 sm:grid-cols-3">
											{settings.currencies.map((c) => <Field key={c} label={`Price ${c}`} name={`price_${c}`} inputMode="decimal" required={c === settings.defaultCurrency} />)}
										</div>
										{tracking && (
											<div className="flex flex-wrap gap-4">
												<CheckboxField label="Track inventory" name="manageInventory" defaultChecked />
												<CheckboxField label="Allow backorders" name="allowBackorder" />
											</div>
										)}
										<SubmitButton size="sm">Add variant</SubmitButton>
									</ActionForm>
								</div>
							</details>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-4">
					<Card>
						<CardHeader><CardTitle>Images</CardTitle></CardHeader>
						<CardContent>
							<div className="grid grid-cols-3 gap-2">
								{product.images.map((img) => (
									<div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img src={imageUrl(img.url, 256)!} alt={img.alt ?? ""} className="size-full object-cover" loading="lazy" />
										{product.thumbnail === img.url && <span className="absolute top-1 left-1 rounded bg-background/90 px-1 text-[10px]">Cover</span>}
										<div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/80 p-1">
											<ActionForm action={setThumbnailAction} className="space-y-0">
												<input type="hidden" name="productId" value={product.id} /><input type="hidden" name="url" value={img.url} />
												<Button type="submit" size="icon-xs" variant="ghost" aria-label="Set as cover"><Star /></Button>
											</ActionForm>
											<ActionForm action={deleteImageAction} confirm="Remove image?" className="space-y-0">
												<input type="hidden" name="imageId" value={img.id} />
												<Button type="submit" size="icon-xs" variant="ghost" aria-label="Delete image"><Trash2 /></Button>
											</ActionForm>
										</div>
									</div>
								))}
								<ImageUploader productId={product.id} />
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Options</CardTitle>
							<CardDescription>One per line, e.g. <code>Size: S, M, L</code></CardDescription>
						</CardHeader>
						<CardContent>
							<ActionForm action={setOptionsAction}>
								<input type="hidden" name="productId" value={product.id} />
								<TextareaField label="Options" name="options" rows={3} defaultValue={product.options.map((o) => `${o.title}: ${o.values.join(", ")}`).join("\n")} />
								<SubmitButton size="sm">Save options</SubmitButton>
							</ActionForm>
						</CardContent>
					</Card>

					<Card>
						<CardHeader><CardTitle>Danger zone</CardTitle></CardHeader>
						<CardContent>
							<ActionForm action={deleteProductAction} confirm="Permanently delete this product? Past orders keep their line items.">
								<input type="hidden" name="id" value={product.id} />
								<Button type="submit" variant="destructive" className="w-full"><Trash2 /> Delete product</Button>
							</ActionForm>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
