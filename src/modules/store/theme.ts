import { z } from "zod";

/**
 * Dashboard appearance. Pure + isomorphic (used by the server to render CSS variables
 * and by the client editor for live preview). Values are strictly validated so they can be
 * safely interpolated into a <style> tag.
 */
export const FONTS = {
	fraunces: { label: "Fraunces", var: "--font-fraunces", kind: "serif" },
	instrument: { label: "Instrument Serif", var: "--font-instrument", kind: "serif" },
	playfair: { label: "Playfair Display", var: "--font-playfair", kind: "serif" },
	newsreader: { label: "Newsreader", var: "--font-newsreader", kind: "serif" },
	inter: { label: "Inter", var: "--font-inter", kind: "sans" },
	geist: { label: "Geist", var: "--font-geist-sans", kind: "sans" },
	plex: { label: "IBM Plex Sans", var: "--font-plex", kind: "sans" },
	dmsans: { label: "DM Sans", var: "--font-dmsans", kind: "sans" },
} as const;
export type FontId = keyof typeof FONTS;
const fontIds = Object.keys(FONTS) as [FontId, ...FontId[]];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color");

export const themeSchema = z.object({
	preset: z.string().max(32),
	colors: z.object({ paper: hex, ink: hex, accent: hex }),
	fonts: z.object({ heading: z.enum(fontIds), body: z.enum(fontIds) }),
	radius: z.enum(["none", "sm", "md", "lg"]),
	surface: z.enum(["rules", "cards"]),
	density: z.enum(["comfortable", "compact"]),
});
export type Theme = z.infer<typeof themeSchema>;

export const PRESETS: Record<string, Theme & { name: string; description: string }> = {
	editorial: {
		name: "Editorial", description: "Warm newsprint, serif headlines, hairline rules",
		preset: "editorial", colors: { paper: "#f4efe6", ink: "#1b1712", accent: "#b5401c" },
		fonts: { heading: "fraunces", body: "inter" }, radius: "none", surface: "rules", density: "comfortable",
	},
	gazette: {
		name: "Gazette", description: "Crisp white broadsheet with a cobalt accent",
		preset: "gazette", colors: { paper: "#ffffff", ink: "#111111", accent: "#1f4fd8" },
		fonts: { heading: "playfair", body: "plex" }, radius: "sm", surface: "rules", density: "comfortable",
	},
	atelier: {
		name: "Atelier", description: "Soft linen, forest green, gentle cards",
		preset: "atelier", colors: { paper: "#f1ede4", ink: "#1f2a24", accent: "#2f5d50" },
		fonts: { heading: "newsreader", body: "dmsans" }, radius: "md", surface: "cards", density: "comfortable",
	},
	noir: {
		name: "Noir", description: "Dark ink stock with gold leaf",
		preset: "noir", colors: { paper: "#141311", ink: "#ece6da", accent: "#d9a84e" },
		fonts: { heading: "instrument", body: "geist" }, radius: "none", surface: "rules", density: "comfortable",
	},
	modern: {
		name: "Modern", description: "Neutral, rounded, product-UI feel",
		preset: "modern", colors: { paper: "#fafafa", ink: "#0a0a0a", accent: "#0a0a0a" },
		fonts: { heading: "geist", body: "geist" }, radius: "lg", surface: "cards", density: "compact",
	},
};

export function presetTheme(id: string): Theme {
	const p = PRESETS[id] ?? PRESETS.editorial;
	return { preset: p.preset, colors: { ...p.colors }, fonts: { ...p.fonts }, radius: p.radius, surface: p.surface, density: p.density };
}

export const DEFAULT_THEME: Theme = presetTheme("editorial");

export function resolveTheme(t: unknown): Theme {
	const parsed = themeSchema.safeParse(t);
	return parsed.success ? parsed.data : DEFAULT_THEME;
}

function luminance(h: string) {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text color on top of `bg`. */
export function onColor(bg: string) {
	return luminance(bg) > 0.4 ? "#111111" : "#ffffff";
}

export const isDark = (t: Theme) => luminance(t.colors.paper) < 0.2;

const RADIUS = { none: "0rem", sm: "0.25rem", md: "0.5rem", lg: "0.75rem" } as const;

/** CSS custom properties consumed by Tailwind/shadcn tokens. */
export function themeVars(t: Theme): Record<string, string> {
	const { paper, ink, accent } = t.colors;
	const mix = (pct: number) => `color-mix(in oklab, ${ink} ${pct}%, ${paper})`;
	const dark = isDark(t);
	return {
		"--background": paper,
		"--foreground": ink,
		"--card": dark ? `color-mix(in oklab, ${ink} 4%, ${paper})` : `color-mix(in oklab, #ffffff 45%, ${paper})`,
		"--card-foreground": ink,
		"--popover": dark ? `color-mix(in oklab, ${ink} 6%, ${paper})` : `color-mix(in oklab, #ffffff 70%, ${paper})`,
		"--popover-foreground": ink,
		"--primary": ink,
		"--primary-foreground": paper,
		"--secondary": mix(7),
		"--secondary-foreground": ink,
		"--muted": mix(6),
		"--muted-foreground": mix(62),
		"--accent": mix(8),
		"--accent-foreground": ink,
		"--brand": accent,
		"--brand-foreground": onColor(accent),
		"--destructive": dark ? "#f07a62" : "#b42318",
		"--border": mix(dark ? 18 : 15),
		"--input": mix(dark ? 24 : 20),
		"--ring": accent,
		"--rule": ink,
		"--radius": RADIUS[t.radius],
		"--theme-heading": `var(${FONTS[t.fonts.heading].var})`,
		"--theme-body": `var(${FONTS[t.fonts.body].var})`,
		"--density": t.density === "compact" ? "0.8" : "1",
	};
}

export function themeCss(t: Theme) {
	const vars = Object.entries(themeVars(t)).map(([k, v]) => `${k}:${v}`).join(";");
	return `:root{${vars};color-scheme:${isDark(t) ? "dark" : "light"}}`;
}
