import { redirect } from "next/navigation";
import { getSession } from "@/server/session";

/** No public storefront: route users to the right dashboard. */
export default async function Home() {
	const s = await getSession();
	if (!s) redirect("/sign-in");
	redirect((s.user as { role?: string }).role === "admin" ? "/admin" : "/account");
}
