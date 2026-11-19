import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/app/pwa";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const name = process.env.STORE_NAME ?? "Commerce";

export const metadata: Metadata = {
	title: { default: name, template: `%s · ${name}` },
	description: "Commerce engine dashboard",
	applicationName: name,
	appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
	icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
	robots: { index: false, follow: false },
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
				{children}
				<Toaster richColors position="top-center" />
				<PwaRegister />
			</body>
		</html>
	);
}
