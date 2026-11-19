"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FONTS, PRESETS, isDark, presetTheme, themeVars, type FontId, type Theme } from "@/modules/store/theme";
import { cn } from "@/lib/utils";
import { saveThemeAction } from "../actions";

const same = (a: Theme, b: Theme) => JSON.stringify(a) === JSON.stringify(b);

/** Applies the draft theme to the live page so every change is previewed in place. */
function useLivePreview(theme: Theme) {
	useEffect(() => {
		const root = document.documentElement;
		const shell = document.querySelector<HTMLElement>("[data-shell]");
		const vars = themeVars(theme);
		for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
		const prev = shell ? { surface: shell.dataset.surface, density: shell.dataset.density, dark: shell.hasAttribute("data-theme-dark") } : null;
		if (shell) {
			shell.dataset.surface = theme.surface;
			shell.dataset.density = theme.density;
			shell.toggleAttribute("data-theme-dark", isDark(theme));
		}
		return () => {
			for (const k of Object.keys(vars)) root.style.removeProperty(k);
			if (shell && prev) {
				shell.dataset.surface = prev.surface;
				shell.dataset.density = prev.density;
				shell.toggleAttribute("data-theme-dark", prev.dark);
			}
		};
	}, [theme]);
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
	return (
		<div role="radiogroup" aria-label={label} className="inline-flex flex-wrap border border-input" style={{ borderRadius: "var(--radius)" }}>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					role="radio"
					aria-checked={value === o.value}
					onClick={() => onChange(o.value)}
					className={cn("min-h-9 px-3 text-sm transition-colors first:rounded-l-[inherit] last:rounded-r-[inherit]", value === o.value ? "bg-foreground text-background" : "hover:bg-muted")}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="grid gap-3 border-t border-border py-5 sm:grid-cols-[12rem_1fr]">
			<div>
				<p className="text-sm font-medium">{title}</p>
				{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
			</div>
			<div>{children}</div>
		</div>
	);
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
	const [text, setText] = useState(value);
	const [prev, setPrev] = useState(value);
	if (prev !== value) { setPrev(value); setText(value); } // sync when a preset/picker changes the value
	return (
		<label className="flex items-center gap-3">
			<input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-10 cursor-pointer border border-input bg-transparent p-0.5" style={{ borderRadius: "var(--radius)" }} aria-label={`${label} color`} />
			<span className="w-16 text-sm">{label}</span>
			<Input
				value={text}
				onChange={(e) => {
					setText(e.target.value);
					if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
				}}
				className="h-10 w-28 font-mono text-xs uppercase"
				aria-label={`${label} hex`}
				maxLength={7}
			/>
		</label>
	);
}

function FontSelect({ value, kind, onChange, label }: { value: FontId; kind: "heading" | "body"; onChange: (v: FontId) => void; label: string }) {
	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{(Object.keys(FONTS) as FontId[]).map((id) => (
				<button
					key={id}
					type="button"
					aria-pressed={value === id}
					aria-label={`${label}: ${FONTS[id].label}`}
					onClick={() => onChange(id)}
					className={cn("flex items-center justify-between gap-3 border px-3 py-2.5 text-left transition-colors", value === id ? "border-foreground bg-muted" : "border-border hover:border-foreground/40")}
					style={{ borderRadius: "var(--radius)" }}
				>
					<span style={{ fontFamily: `var(${FONTS[id].var})` }} className={kind === "heading" ? "text-xl leading-none" : "text-sm"}>
						{kind === "heading" ? "The Ledger" : "Orders shipped today"}
					</span>
					<span className="text-[11px] text-muted-foreground">{FONTS[id].label}</span>
				</button>
			))}
		</div>
	);
}

export function ThemeEditor({ initial }: { initial: Theme }) {
	const [saved, setSaved] = useState(initial);
	const [theme, setTheme] = useState(initial);
	const [pending, start] = useTransition();
	useLivePreview(theme);
	const dirty = !same(theme, saved);
	const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setTheme((t) => ({ ...t, [k]: v, preset: k === "preset" ? (v as string) : "custom" }));
	const presets = useMemo(() => Object.entries(PRESETS), []);

	const save = () =>
		start(async () => {
			const r = await saveThemeAction(theme);
			if (r?.ok) { setSaved(theme); toast.success(r.message ?? "Saved"); }
			else toast.error(r?.error ?? "Could not save");
		});

	return (
		<div>
			<section>
				<p className="eyebrow mb-3">Presets</p>
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{presets.map(([id, p]) => {
						const active = theme.preset === id;
						return (
							<button
								key={id}
								type="button"
								onClick={() => setTheme(presetTheme(id))}
								aria-pressed={active}
								className={cn("group overflow-hidden border text-left transition-shadow", active ? "border-foreground ring-2 ring-brand/40" : "border-border hover:border-foreground/40")}
								style={{ borderRadius: "var(--radius)" }}
							>
								<div className="flex h-28 flex-col justify-between p-4" style={{ background: p.colors.paper, color: p.colors.ink }}>
									<span style={{ fontFamily: `var(${FONTS[p.fonts.heading].var})` }} className="text-3xl leading-none">{p.name}</span>
									<div className="flex items-center gap-2">
										<span className="h-1.5 w-10" style={{ background: p.colors.accent }} />
										<span className="h-px flex-1" style={{ background: p.colors.ink, opacity: 0.6 }} />
										{active && <Check className="size-4" />}
									</div>
								</div>
								<div className="border-t border-border px-4 py-2.5">
									<p className="text-xs text-muted-foreground">{p.description}</p>
								</div>
							</button>
						);
					})}
				</div>
			</section>

			<section className="mt-10">
				<p className="eyebrow">Customise</p>
				<Row title="Colours" hint="Paper is the page, ink is the text, accent highlights.">
					<div className="flex flex-col gap-3">
						<ColorField label="Paper" value={theme.colors.paper} onChange={(v) => set("colors", { ...theme.colors, paper: v })} />
						<ColorField label="Ink" value={theme.colors.ink} onChange={(v) => set("colors", { ...theme.colors, ink: v })} />
						<ColorField label="Accent" value={theme.colors.accent} onChange={(v) => set("colors", { ...theme.colors, accent: v })} />
					</div>
				</Row>
				<Row title="Headline font" hint="Titles, numbers and section heads.">
					<FontSelect label="Headline font" kind="heading" value={theme.fonts.heading} onChange={(v) => set("fonts", { ...theme.fonts, heading: v })} />
				</Row>
				<Row title="Body font" hint="Forms, tables and everything else.">
					<FontSelect label="Body font" kind="body" value={theme.fonts.body} onChange={(v) => set("fonts", { ...theme.fonts, body: v })} />
				</Row>
				<Row title="Layout" hint="Hairline rules feel like a newspaper; cards feel like an app.">
					<Segmented label="Layout" value={theme.surface} onChange={(v) => set("surface", v)} options={[{ value: "rules", label: "Rules" }, { value: "cards", label: "Cards" }]} />
				</Row>
				<Row title="Corners">
					<Segmented label="Corners" value={theme.radius} onChange={(v) => set("radius", v)} options={[{ value: "none", label: "Square" }, { value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Round" }]} />
				</Row>
				<Row title="Density">
					<Segmented label="Density" value={theme.density} onChange={(v) => set("density", v)} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
				</Row>
				<Row title="Specimen" hint="How common elements look.">
					<div className="space-y-4">
						<p className="display text-4xl">₦1,284,500</p>
						<p className="max-w-md font-heading text-lg text-muted-foreground">Twelve orders this week, three waiting to be packed.</p>
						<div className="flex flex-wrap items-center gap-3">
							<Button>Primary</Button>
							<Button variant="outline">Secondary</Button>
							<span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em]"><span className="size-1.5 rounded-full bg-brand" />Shipped</span>
							<a className="text-sm text-brand underline">A link</a>
						</div>
						<Input placeholder="Search products" className="h-10 max-w-sm" />
					</div>
				</Row>
			</section>

			<div className="sticky bottom-0 z-40 -mx-4 mt-6 border-t border-rule bg-background/95 backdrop-blur sm:-mx-6 lg:-mx-12">
				<div className="flex items-center justify-between gap-3 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-12">
					<p className="text-sm text-muted-foreground">{dirty ? "Unsaved changes — previewing live" : "All changes saved"}</p>
					<div className="flex gap-2">
						<Button variant="ghost" disabled={!dirty || pending} onClick={() => setTheme(saved)}><RotateCcw /> Revert</Button>
						<Button disabled={!dirty || pending} onClick={save}>{pending && <Loader2 className="animate-spin" />} Save appearance</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
