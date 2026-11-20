import { LayoutDashboard, Package, FolderTree, Layers, Boxes, ShoppingCart, Users, TicketPercent, Truck, Settings, Palette, BookOpen } from "lucide-react";
import { hasFeature, type Feature } from "@/lib/plan";
import { NavShell, type NavItem } from "@/components/app/nav-shell";
import { ThemeStyle } from "@/components/app/theme-style";
import { requireAdmin } from "@/server/session";
import { getSettings } from "@/modules/store/service";
import { isDark, resolveTheme } from "@/modules/store/theme";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
	const [admin, settings] = await Promise.all([requireAdmin(), getSettings()]);
	const theme = resolveTheme(settings.theme);
	return (
		<>
			<ThemeStyle theme={theme} />
			<NavShell
				title={settings.name}
				edition="Admin edition"
				surface={theme.surface}
				density={theme.density}
				dark={isDark(theme)}
				user={{ name: admin.name, email: admin.email }}
				items={([
					{ href: "/admin", label: "Overview", icon: <LayoutDashboard />, exact: true },
					{ href: "/admin/orders", label: "Orders", icon: <ShoppingCart /> },
					{ href: "/admin/products", label: "Products", icon: <Package /> },
					{ href: "/admin/inventory", label: "Inventory", icon: <Boxes />, feature: "inventoryTracking" },
					{ href: "/admin/categories", label: "Categories", icon: <FolderTree /> },
					{ href: "/admin/collections", label: "Collections", icon: <Layers />, feature: "collections" },
					{ href: "/admin/customers", label: "Customers", icon: <Users /> },
					{ href: "/admin/promotions", label: "Promotions", icon: <TicketPercent />, feature: "discounts" },
					{ href: "/admin/shipping", label: "Shipping", icon: <Truck /> },
					{ href: "/admin/appearance", label: "Appearance", icon: <Palette /> },
					{ href: "/admin/settings", label: "Settings", icon: <Settings /> },
					{ href: "/admin/guide", label: "Guide", icon: <BookOpen /> },
				] satisfies (NavItem & { feature?: Feature })[]).filter((i) => !i.feature || hasFeature(i.feature))}
			>
				{children}
			</NavShell>
		</>
	);
}
