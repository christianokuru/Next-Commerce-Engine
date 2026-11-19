import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Payment" };

const COPY: Record<string, { title: string; body: string; icon: React.ReactNode }> = {
	succeeded: { title: "Payment successful", body: "Your order is confirmed. A receipt is on its way to your email.", icon: <CheckCircle2 className="size-10 text-green-600" /> },
	pending: { title: "Payment processing", body: "We're waiting for confirmation from the payment provider. You'll get an email once it's confirmed.", icon: <Clock className="size-10 text-amber-500" /> },
	requires_action: { title: "We're reviewing your payment", body: "Your payment was received but needs a quick review. Our team will contact you shortly.", icon: <Clock className="size-10 text-amber-500" /> },
	failed: { title: "Payment failed", body: "Your payment was not completed. No order was placed.", icon: <XCircle className="size-10 text-destructive" /> },
	canceled: { title: "Payment canceled", body: "You canceled the payment. Your cart is still saved.", icon: <XCircle className="size-10 text-muted-foreground" /> },
};

/** Fallback landing page when no storefront URL is configured. Shows status only — no sensitive data. */
export default async function Result({ searchParams }: { searchParams: Promise<{ status?: string; number?: string }> }) {
	const sp = await searchParams;
	const c = COPY[sp.status ?? ""] ?? { title: "Something went wrong", body: "We couldn't confirm this payment. If you were charged, contact support.", icon: <XCircle className="size-10 text-destructive" /> };
	return (
		<main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
			<Card className="w-full max-w-sm text-center">
				<CardContent className="flex flex-col items-center gap-3 py-6">
					{c.icon}
					<h1 className="text-lg font-semibold">{c.title}</h1>
					{sp.status === "succeeded" && sp.number && /^\d+$/.test(sp.number) && <p className="text-sm">Order #{sp.number}</p>}
					<p className="text-sm text-muted-foreground">{c.body}</p>
					<Link href="/account/orders" className={buttonVariants({ className: "mt-2 h-10 w-full" })}>View my orders</Link>
				</CardContent>
			</Card>
		</main>
	);
}
