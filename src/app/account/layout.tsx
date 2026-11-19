import { Home, Package, MapPin, User } from "lucide-react";
import { NavShell } from "@/components/app/nav-shell";
import { requireCustomer } from "@/server/session";
import { getSettings } from "@/modules/store/service";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "My account", template: "%s · My account" } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
	const [{ user }, settings] = await Promise.all([requireCustomer(), getSettings()]);
	return (
		<NavShell
			title={settings.name}
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
	);
}
