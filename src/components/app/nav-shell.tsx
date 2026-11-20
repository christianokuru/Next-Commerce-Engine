"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, LogOut, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean; locked?: boolean };
type ShellProps = {
	title: string;
	edition: string;
	items: NavItem[];
	user: { name: string; email: string };
	surface: "rules" | "cards";
	density: "comfortable" | "compact";
	dark: boolean;
	children: React.ReactNode;
};

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
	const path = usePathname();
	return (
		<nav className="ledger">
			{items.map((i, n) => {
				const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
				return (
					<Link
						key={i.href}
						href={i.href}
						onClick={onNavigate}
						aria-current={active ? "page" : undefined}
						className={cn(
							"group flex min-h-11 items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
							active && "text-foreground",
						)}
					>
						<span className={cn("w-6 text-[11px] tabular-nums", active ? "text-brand" : "text-muted-foreground/70")}>{String(n + 1).padStart(2, "0")}</span>
						<span className={cn("flex-1", active && "font-medium", i.locked && "opacity-60")}>{i.label}</span>
						{i.locked && <Lock aria-label="Not in your plan" className="size-3 opacity-50" />}
						<span className={cn("opacity-0 transition-opacity [&_svg]:size-3.5 group-hover:opacity-60", active && "text-brand opacity-100")}>{i.icon}</span>
					</Link>
				);
			})}
		</nav>
	);
}

function Masthead({ title, edition }: { title: string; edition: string }) {
	const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
	return (
		<div>
			<p className="eyebrow">{edition}</p>
			<p className="display mt-1 text-[1.75rem]">{title}</p>
			<p className="mt-2 border-t-2 border-foreground pt-1.5 text-[11px] text-muted-foreground">{date}</p>
		</div>
	);
}

/** Editorial app shell: masthead sidebar from `lg`, slide-over nav on phones. */
export function NavShell({ title, edition, items, user, surface, density, dark, children }: ShellProps) {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	const signOut = async () => {
		await authClient.signOut();
		router.replace("/sign-in");
		router.refresh();
	};
	const footer = (
		<div className="border-t border-rule pt-3">
			<p className="truncate text-sm font-medium">{user.name}</p>
			<p className="truncate text-xs text-muted-foreground">{user.email}</p>
			<Button variant="ghost" className="mt-2 -ml-2.5 justify-start gap-2 text-muted-foreground" onClick={signOut}>
				<LogOut className="size-4" /> Sign out
			</Button>
		</div>
	);
	return (
		<div data-shell data-surface={surface} data-density={density} {...(dark ? { "data-theme-dark": "" } : {})} className="min-h-dvh bg-background text-foreground">
			<header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-rule bg-background/95 px-4 backdrop-blur pt-[env(safe-area-inset-top)] lg:hidden">
				<Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}><Menu /></Button>
				<span className="display text-xl">{title}</span>
			</header>
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent side="left" className="flex w-72 flex-col gap-6 bg-background p-5">
					<SheetTitle className="sr-only">{title}</SheetTitle>
					<Masthead title={title} edition={edition} />
					<div className="flex-1 overflow-y-auto"><NavLinks items={items} onNavigate={() => setOpen(false)} /></div>
					{footer}
				</SheetContent>
			</Sheet>
			<aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-8 border-r border-rule bg-background px-6 py-7 lg:flex">
				<Link href={items[0]?.href ?? "/"} className="block"><Masthead title={title} edition={edition} /></Link>
				<div className="flex-1 overflow-y-auto"><NavLinks items={items} /></div>
				{footer}
			</aside>
			<div className="lg:pl-64">
				<main className="mx-auto w-full max-w-6xl px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-12 lg:py-10">{children}</main>
			</div>
		</div>
	);
}
