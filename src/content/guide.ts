/**
 * Store-owner guide: plain-language docs for every feature.
 * Rendered in Admin → Guide and exported to docs/FEATURES.md (`npm run docs`).
 * `feature` links an entry to its plan gate; entries without one are in every plan.
 * "Coming soon" comes from FEATURES[feature].soon in src/lib/plan.ts.
 */
import type { Feature } from "@/lib/plan";

export type GuideEntry = {
	id: string;
	title: string;
	feature?: Feature;
	summary: string;
	steps?: string[];
	tips?: string[];
};

export type GuideSection = { title: string; entries: GuideEntry[] };

export const GUIDE: GuideSection[] = [
	{
		title: "Getting started",
		entries: [
			{
				id: "overview",
				title: "Your dashboard",
				summary: "The Overview page is your daily front page: revenue for the last 30 days, a daily sales chart, the latest orders and products running low.",
				tips: ["Check “Running low” each morning so popular items never sell out unexpectedly."],
			},
			{
				id: "settings",
				title: "Store settings",
				summary: "Your store name, support email, logo, storefront address, currency and tax.",
				steps: [
					"Go to Settings.",
					"Fill in the Store section. The support email receives new-order alerts and is the reply-to address on customer emails.",
					"Set Tax rate (%) and whether your prices already include tax.",
					"Click Save.",
				],
				tips: ["If prices include tax, customers see one clean price and the tax portion is shown on receipts."],
			},
			{
				id: "appearance",
				title: "Appearance",
				summary: "Change how your dashboards look: colours, fonts, layout style, corners and spacing. Changes preview live before you save.",
				steps: ["Go to Appearance.", "Pick a preset (Editorial, Gazette, Atelier, Noir, Modern) or adjust colours and fonts yourself.", "Click Save."],
			},
		],
	},
	{
		title: "Selling",
		entries: [
			{
				id: "products",
				title: "Products",
				summary: "Everything you sell. Each product has a title, description, images, a status, and one or more variants (for example sizes or colours), each with its own price and SKU.",
				steps: [
					"Go to Products → New product.",
					"Enter the title, description and price. Save as Draft while you prepare it.",
					"Upload images and choose one as the cover image.",
					"For sizes/colours, add Options (e.g. Size: S, M, L) then a variant for each combination.",
					"Set the status to Published to make it visible on your storefront.",
				],
				tips: [
					"Draft products are never shown to customers.",
					"Archived products disappear from the shop but keep their order history.",
					"Starter includes up to 50 products. Standard and above are unlimited.",
				],
			},
			{
				id: "categories",
				title: "Categories",
				summary: "Group products the way customers browse: Men, Women, Accessories. A product can be in several categories.",
				steps: ["Go to Categories → add a name.", "Open a product and tick its categories."],
			},
			{
				id: "collections",
				title: "Collections",
				feature: "collections",
				summary: "Curated groups for campaigns and seasons, like “New arrivals” or “Black Friday picks”. Your storefront can feature them on the home page.",
				steps: ["Go to Collections → add a title and description.", "Open a product and choose its collection."],
			},
			{
				id: "inventory",
				title: "Stock tracking",
				feature: "inventoryTracking",
				summary: "Track how many of each variant you have. Stock goes down automatically when an order is paid and back up if you cancel. The shop stops selling items that run out.",
				steps: [
					"Go to Inventory to see every variant's stock.",
					"Use Set to enter a count after a stock-take, or Add when a delivery arrives.",
					"Set a low-stock alert level per variant to see it under “Running low”.",
				],
				tips: [
					"Allow backorders on a variant to keep selling when it hits zero.",
					"Two customers can never buy the last item at the same time; the engine reserves stock safely.",
					"Without stock tracking (Starter), every published item is always available.",
				],
			},
			{
				id: "discounts",
				title: "Discount codes",
				feature: "discounts",
				summary: "Codes customers enter at checkout: a percentage off, a fixed amount off, or free shipping.",
				steps: [
					"Go to Promotions → New promotion.",
					"Choose the code (e.g. WELCOME10) and the type: Percentage, Fixed amount or Free shipping.",
					"Optional: a minimum order amount, a usage limit, and start/end dates.",
					"Save. Switch it off any time without deleting it.",
				],
				tips: ["Usage is counted only when payment succeeds, so abandoned carts never use up a limited code."],
			},
			{
				id: "advanced-promotions",
				title: "Advanced promotions",
				feature: "advancedPromotions",
				summary: "Automatic sales with no code, buy X get Y, discounts on specific products or categories, one use per customer, and gift cards.",
			},
		],
	},
	{
		title: "Orders & payments",
		entries: [
			{
				id: "orders",
				title: "Orders",
				summary: "Every paid order appears here with the items, customer, address, payment and a timeline of everything that happened.",
				steps: [
					"Go to Orders and open an order.",
					"When you pack it, set fulfilment to Fulfilled. When you hand it to a courier, set Shipped and add the carrier and tracking number; the customer is emailed automatically.",
					"Mark Delivered when it arrives.",
					"Add internal notes (customers never see them).",
				],
				tips: ["Orders marked “Requires action” need a look: usually an item sold out or the amount paid didn't match. The details are in the timeline."],
			},
			{
				id: "refunds",
				title: "Refunds & cancellations",
				summary: "Refund all or part of an order straight to the customer's card or account through the payment provider. Cancelling an order puts its items back in stock.",
				steps: ["Open the order.", "Use Refund and enter the amount (full or partial) and a reason.", "Or use Cancel to cancel an unshipped order."],
			},
			{
				id: "payments",
				title: "Payments",
				summary: "Customers pay on the provider's secure page (Paystack, Flutterwave or Stripe, depending on your store). Your store never sees card details.",
				steps: ["Your developer adds the provider keys.", "In Settings → Payment providers, switch on the providers you want to offer."],
				tips: [
					"Every payment is double-checked directly with the provider before an order is created, so fake or tampered payments are rejected.",
					"If a customer is charged twice, the second payment is flagged for refund instead of creating a duplicate order.",
				],
			},
			{
				id: "emails",
				title: "Order emails",
				summary: "Sent automatically: an order confirmation to the customer, a new-order alert to you, and a “your order has shipped” email with tracking.",
				tips: ["New-order alerts go to your support email, or to all staff if none is set."],
			},
			{
				id: "shipping",
				title: "Shipping",
				summary: "Where you deliver and what it costs. A zone is a group of countries; each zone has one or more shipping options with a price.",
				steps: [
					"Go to Shipping → add a zone (e.g. “Nigeria”: NG).",
					"Add options to the zone, e.g. “Lagos same-day: ₦3,000” and “Nationwide: ₦5,000”.",
					"Optional: “Free over” makes an option free above an order amount.",
				],
			},
			{
				id: "multi-currency",
				title: "Multiple currencies",
				feature: "multiCurrency",
				summary: "Sell in more than one currency (for example NGN and USD). Each product has its own price per currency, and customers pay in the currency they choose.",
				steps: ["Go to Settings → add currencies.", "Open each product's variants and enter a price for each currency."],
			},
			{
				id: "logistics",
				title: "Delivery integration",
				feature: "logistics",
				summary: "Live delivery rates and tracking from couriers such as GIG, Sendbox and Kwik, booked from the order page.",
			},
		],
	},
	{
		title: "Customers",
		entries: [
			{
				id: "customers",
				title: "Customer list",
				summary: "Everyone who has ordered from you, with their contact details, addresses and order history.",
			},
			{
				id: "accounts",
				title: "Customer accounts",
				feature: "customerAccounts",
				summary: "Customers can sign up, verify their email, and use their own dashboard to see orders, save addresses and manage their profile.",
				tips: ["Without accounts (Starter), customers check out as guests and get every update by email."],
			},
			{
				id: "reviews",
				title: "Product reviews",
				feature: "reviews",
				summary: "Verified-buyer star ratings and reviews, with approval before they go live.",
			},
			{
				id: "analytics",
				title: "Analytics",
				feature: "analytics",
				summary: "Best sellers, revenue by period, repeat customers and discount performance, with CSV export.",
			},
		],
	},
	{
		title: "Team & integrations",
		entries: [
			{
				id: "team",
				title: "Staff accounts",
				summary: "Give team members their own login to the dashboard. Each person signs in with their own email, so you always know who did what.",
				steps: ["Ask the person to create an account first.", "Go to Settings → Team, enter their email and choose Admin."],
				tips: ["Starter includes 1 staff account, Standard 3, Advanced 10."],
			},
			{
				id: "api-keys",
				title: "API keys",
				feature: "apiKeys",
				summary: "Secure keys that let other tools (an accounting app, a warehouse system, a custom script) read and manage your store.",
				steps: ["Go to Settings → API keys → name the key → Create.", "Copy it straight away; it's only shown once.", "Revoke a key instantly if it's no longer needed."],
			},
			{
				id: "multivendor",
				title: "Multi-vendor marketplace",
				feature: "multiVendor",
				summary: "Let other sellers join your store with their own dashboards. Payments are split automatically and you earn a commission on each sale.",
			},
		],
	},
	{
		title: "Security",
		entries: [
			{
				id: "security",
				title: "How your store is protected",
				summary: "Built-in protections you don't need to configure.",
				tips: [
					"Passwords are hashed; nobody, including your developer, can read them.",
					"Email verification is required before a customer account can sign in.",
					"Repeated wrong passwords are slowed down to stop guessing attacks.",
					"Prices and totals are always calculated on the server, so they can't be changed in the browser.",
					"Payment confirmations from providers are signature-checked and processed exactly once.",
				],
			},
		],
	},
];

export const guideEntry = (feature: Feature) => GUIDE.flatMap((s) => s.entries).find((e) => e.feature === feature);
