import { LayoutDashboard, Package, FolderTree, Layers, Boxes, ShoppingCart, Users, TicketPercent, Truck, Settings } from "lucide-react";
import { NavShell } from "@/components/app/nav-shell";
import { requireAdmin } from "@/server/session";
import { getSettings } from "@/modules/store/service";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
	const [admin, settings] = await Promise.all([requireAdmin(), getSettings()]);
	return (
		<NavShell
			title={settings.name}
			user={{ name: admin.name, email: admin.email }}
			items={[
				{ href: "/admin", label: "Overview", icon: <LayoutDashboard />, exact: true },
				{ href: "/admin/orders", label: "Orders", icon: <ShoppingCart /> },
				{ href: "/admin/products", label: "Products", icon: <Package /> },
				{ href: "/admin/inventory", label: "Inventory", icon: <Boxes /> },
				{ href: "/admin/categories", label: "Categories", icon: <FolderTree /> },
				{ href: "/admin/collections", label: "Collections", icon: <Layers /> },
				{ href: "/admin/customers", label: "Customers", icon: <Users /> },
				{ href: "/admin/promotions", label: "Promotions", icon: <TicketPercent /> },
				{ href: "/admin/shipping", label: "Shipping", icon: <Truck /> },
				{ href: "/admin/settings", label: "Settings", icon: <Settings /> },
			]}
		>
			{children}
		</NavShell>
	);
}
