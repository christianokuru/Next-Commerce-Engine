/**
 * `npm run seed` (local development only): a small demo catalogue so a storefront has something to show.
 * Images are generated SVGs (no uploads, no network). Refuses to run if products already exist.
 */
import { updateSettings } from "@/modules/store/service";
import { createCategory, createCollection, addProductImage, countProducts } from "@/modules/product/service";
import { createProduct } from "@/workflows/catalog";
import { createZone, createOption } from "@/modules/shipping/service";
import { createPromotion } from "@/modules/promotion/service";

const art = (title: string, bg: string, variant: 0 | 1) => {
	const initial = title.trim()[0]!.toUpperCase();
	const dots = Array.from({ length: 6 }, (_, r) =>
		Array.from({ length: 6 }, (_, c) => `<circle cx="${60 + c * 96}" cy="${60 + r * 96}" r="${variant ? 30 : 14}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>`).join(""),
	).join("");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><rect width="600" height="750" fill="${bg}"/>${dots}<rect x="${variant ? 70 : 150}" y="${variant ? 120 : 190}" width="${variant ? 460 : 300}" height="${variant ? 510 : 370}" fill="#f4efe9" fill-opacity=".1" stroke="#fff" stroke-opacity=".35"/><text x="300" y="${variant ? 470 : 450}" font-family="Georgia,serif" font-size="${variant ? 300 : 220}" fill="#fff" fill-opacity=".9" text-anchor="middle">${initial}</text><text x="300" y="705" font-family="Georgia,serif" font-size="26" fill="#fff" fill-opacity=".8" text-anchor="middle" font-style="italic">${title.replace(/&/g, "&amp;")}</text></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export async function seedDemo() {
	if ((await countProducts()) > 0) return { seeded: false, reason: "Products already exist; demo data was not added." };

	await updateSettings({
		name: "Adire House", supportEmail: "hello@adirehouse.test", currencies: ["NGN", "USD"], defaultCurrency: "NGN",
		taxRateBps: 750, taxInclusive: true, paymentProviders: ["paystack", "flutterwave", "stripe"], storefrontUrl: "http://localhost:3001",
	});
	const men = await createCategory({ name: "Men", description: "Shirts, kaftans and two-pieces" });
	const women = await createCategory({ name: "Women", description: "Dresses, wraps and sets" });
	const acc = await createCategory({ name: "Accessories", description: "Caps, bags and finishing touches" });
	const newIn = await createCollection({ title: "New Arrivals", description: "Fresh from the workshop" });
	const owambe = await createCollection({ title: "Owambe Edit", description: "Party-ready pieces" });

	type Row = [title: string, ngn: number, usd: number, cat: string, col: string | null, sizes: string[] | null, color: string, opts?: { stock?: number; compareAt?: number; draft?: boolean }];
	const rows: Row[] = [
		["Adire Silk Shirt", 28000, 35, men, newIn, ["S", "M", "L"], "#1e3a8a"],
		["Ankara Wrap Dress", 42000, 50, women, owambe, ["S", "M", "L"], "#b45309", { compareAt: 52000 }],
		["Aso-Oke Cap", 12000, 15, acc, owambe, null, "#7c2d12"],
		["Linen Kaftan", 55000, 65, men, owambe, ["M", "L", "XL"], "#065f46"],
		["Beaded Clutch", 18500, 22, acc, newIn, null, "#9d174d", { stock: 2 }],
		["Kampala Two-Piece", 47000, 55, women, newIn, ["S", "M"], "#4c1d95"],
		["Indigo Bucket Hat", 15000, 18, acc, null, null, "#334155", { stock: 0 }],
		["Tie-Dye Tote", 9500, 12, acc, null, null, "#0e7490"],
		["Leather Sandals", 22000, 27, acc, null, ["42", "43", "44"], "#78350f", { draft: true }],
	];
	for (const [i, [title, ngn, usd, cat, col, sizes, color, o = {}]] of rows.entries()) {
		const prices = [
			{ currencyCode: "NGN", amount: ngn * 100, compareAtAmount: o.compareAt ? o.compareAt * 100 : null },
			{ currencyCode: "USD", amount: usd * 100 },
		];
		const sku = title.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
		const variants = sizes
			? sizes.map((s) => ({ title: s, options: { Size: s }, sku: `${sku}-${s}`, prices, stock: o.stock ?? 6 + i }))
			: [{ title: "Default", sku: `${sku}-1`, prices, stock: o.stock ?? 20 }];
		const id = await createProduct({
			title, status: o.draft ? "draft" : "published", categoryIds: [cat], collectionId: col,
			subtitle: sizes ? `Sizes ${sizes.join(" · ")}` : "One size",
			description: `${title}, handmade in Lagos from locally sourced fabric. Each piece is dyed and finished by hand, so colours vary slightly — that's the point.`,
			options: sizes ? [{ title: "Size", values: sizes }] : [], variants,
		});
		await addProductImage(id, { url: art(title, color, 0), alt: title });
		await addProductImage(id, { url: art(title, color, 1), alt: `${title}, detail` });
	}

	const ng = await createZone({ name: "Nigeria", countries: ["NG"] });
	await createOption({ zoneId: ng, name: "Lagos Standard", currencyCode: "NGN", amount: 250000, freeOverAmount: 10000000, minDeliveryDays: 1, maxDeliveryDays: 3 });
	await createOption({ zoneId: ng, name: "Express (same day)", currencyCode: "NGN", amount: 500000, minDeliveryDays: 0, maxDeliveryDays: 1 });
	const intl = await createZone({ name: "International", countries: ["GH", "GB", "US"] });
	await createOption({ zoneId: intl, name: "DHL Express", currencyCode: "USD", amount: 3500, minDeliveryDays: 3, maxDeliveryDays: 7 });
	await createPromotion({ code: "WELCOME10", type: "percentage", value: 10, description: "10% off your first order" });
	await createPromotion({ code: "FREESHIP", type: "free_shipping", value: 0, usageLimit: 100 });
	return { seeded: true, products: rows.length };
}
