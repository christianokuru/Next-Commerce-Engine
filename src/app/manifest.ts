import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	const name = process.env.STORE_NAME ?? "Commerce";
	return {
		name: `${name} — Commerce`,
		short_name: name,
		description: "Store management and customer account",
		start_url: "/account",
		scope: "/",
		display: "standalone",
		orientation: "portrait",
		background_color: "#ffffff",
		theme_color: "#0a0a0a",
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
			{ src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
		shortcuts: [
			{ name: "Orders", url: "/admin/orders" },
			{ name: "My account", url: "/account" },
		],
	};
}
