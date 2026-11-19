import { themeCss, type Theme } from "@/modules/store/theme";

/** Injects the store theme as CSS variables. Values are schema-validated (hex colors, enums) → safe to inline. */
export function ThemeStyle({ theme }: { theme: Theme }) {
	return <style id="store-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />;
}
