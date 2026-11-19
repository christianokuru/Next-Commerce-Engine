import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Serif, Playfair_Display, Newsreader, Inter, Geist, Geist_Mono, IBM_Plex_Sans, DM_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/app/pwa";
import "./globals.css";

// Curated, self-hosted font set the admin can choose from (Appearance). preload:false → only the fonts in use download.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], preload: false, axes: ["opsz", "SOFT"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", preload: false });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], preload: false });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], preload: false });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"], preload: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"], preload: false });
const dmsans = DM_Sans({ variable: "--font-dmsans", subsets: ["latin"], preload: false });
const fontVars = [fraunces, instrument, playfair, newsreader, inter, geist, geistMono, plex, dmsans].map((f) => f.variable).join(" ");

const name = process.env.STORE_NAME ?? "Commerce";

export const metadata: Metadata = {
	title: { default: name, template: `%s · ${name}` },
	description: "Commerce engine dashboard",
	applicationName: name,
	appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
	icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
	robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f4efe6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		// Font variables live on <html> so :root-level theme tokens (--theme-body/heading) can resolve them.
		<html lang="en" className={fontVars}>
			<body className="font-sans antialiased">
				{children}
				<Toaster position="top-center" />
				<PwaRegister />
			</body>
		</html>
	);
}
