import { Home, Package, MapPin, User } from "lucide-react";
import { NavShell } from "@/components/app/nav-shell";
import { ThemeStyle } from "@/components/app/theme-style";
import { requireCustomer } from "@/server/session";
import { getSettings } from "@/modules/store/service";
import { isDark, resolveTheme } from "@/modules/store/theme";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "My account", template: "%s · My account" } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
	const [{ user }, settings] = await Promise.all([requireCustomer(), getSettings()]);
	const theme = resolveTheme(settings.theme);
	return (
		<>
			<ThemeStyle theme={theme} />
			<NavShell
				title={settings.name}
				edition="Your account"
				surface={theme.surface}
				density={theme.density}
				dark={isDark(theme)}
				user={{ name: user.name, email: user.email }}
				items={[
					{ href: "/account", label: "Overview", icon: <Home />, exact: true },
					{ href: "/account/orders", label: "Orders", icon: <Package /> },
					{ href: "/account/addresses", label: "Addresses", icon: <MapPin /> },
					{ href: "/account/profile", label: "Profile", icon: <User /> },
				]}
			>
				{children}
			</NavShell>
		</>
	);
}
