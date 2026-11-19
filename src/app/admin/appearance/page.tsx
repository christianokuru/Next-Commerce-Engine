import { PageHeader } from "@/components/app/ui-bits";
import { getSettingsUncached } from "@/modules/store/service";
import { resolveTheme } from "@/modules/store/theme";
import { ThemeEditor } from "./theme-editor";

export const metadata = { title: "Appearance" };
export const dynamic = "force-dynamic";

export default async function Appearance() {
	const theme = resolveTheme((await getSettingsUncached()).theme);
	return (
		<>
			<PageHeader eyebrow="Store" title="Appearance" description="Colours, typography and layout for the admin and customer dashboards. Changes preview live; nothing is applied until you save." />
			<ThemeEditor initial={theme} />
		</>
	);
}
