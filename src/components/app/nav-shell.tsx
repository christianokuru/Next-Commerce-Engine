"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
	const path = usePathname();
	return (
		<nav className="grid gap-1">
			{items.map((i) => {
				const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
				return (
					<Link
						key={i.href}
						href={i.href}
						onClick={onNavigate}
						className={cn(
							"flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
							active && "bg-muted text-foreground",
						)}
					>
						<span className="[&_svg]:size-4">{i.icon}</span>
						{i.label}
					</Link>
				);
			})}
		</nav>
	);
}

/** Mobile-first app shell: top bar + slide-over nav on phones, fixed sidebar from `lg`. */
export function NavShell({ title, items, user, children }: { title: string; items: NavItem[]; user: { name: string; email: string }; children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	const signOut = async () => {
		await authClient.signOut();
		router.replace("/sign-in");
		router.refresh();
	};
	const footer = (
		<div className="border-t pt-3">
			<p className="truncate px-3 text-sm font-medium">{user.name}</p>
			<p className="truncate px-3 text-xs text-muted-foreground">{user.email}</p>
			<Button variant="ghost" className="mt-2 w-full justify-start gap-3 px-3" onClick={signOut}>
				<LogOut className="size-4" /> Sign out
			</Button>
		</div>
	);
	return (
		<div className="min-h-dvh bg-muted/30">
			<header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur pt-[env(safe-area-inset-top)] lg:hidden">
				<Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
					<Menu />
				</Button>
				<span className="font-semibold">{title}</span>
			</header>
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent side="left" className="flex w-72 flex-col gap-4 p-4">
					<SheetTitle className="px-3 pt-1">{title}</SheetTitle>
					<div className="flex-1 overflow-y-auto"><NavLinks items={items} onNavigate={() => setOpen(false)} /></div>
					{footer}
				</SheetContent>
			</Sheet>
			<aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-4 border-r bg-background p-4 lg:flex">
				<Link href={items[0]?.href ?? "/"} className="px-3 pt-1 text-lg font-semibold">{title}</Link>
				<div className="flex-1 overflow-y-auto"><NavLinks items={items} /></div>
				{footer}
			</aside>
			<div className="lg:pl-64">
				<main className="mx-auto w-full max-w-6xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-8">{children}</main>
			</div>
		</div>
	);
}
