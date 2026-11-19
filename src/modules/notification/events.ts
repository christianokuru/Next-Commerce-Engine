import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "../auth/schema";
import { getOrder } from "../order/service";
import { getSettings } from "../store/service";
import { sendEmail } from "./email";
import { adminNewOrderEmail, orderConfirmationEmail, shippedEmail } from "./templates";
import { runInBackground } from "@/lib/background";
import { appUrl } from "@/lib/env";

/** Domain event handlers. Side effects run after the response (waitUntil), never inside DB transactions. */
export async function onOrderPlaced(orderId: string) {
	await runInBackground(async () => {
		const [order, settings] = await Promise.all([getOrder(orderId), getSettings()]);
		if (!order) return;
		const mail = orderConfirmationEmail(settings.name, order, `${appUrl()}/account/orders/${order.id}`);
		const admins = await db().select({ email: user.email }).from(user).where(eq(user.role, "admin"));
		const adminTo = settings.supportEmail ? [settings.supportEmail] : admins.map((a) => a.email);
		await Promise.allSettled([
			sendEmail({ to: order.email, ...mail, replyTo: settings.supportEmail ?? undefined }),
			adminTo.length ? sendEmail({ to: adminTo, ...adminNewOrderEmail(settings.name, order, `${appUrl()}/admin/orders/${order.id}`) }) : null,
		]);
	});
}

export async function onOrderShipped(orderId: string) {
	await runInBackground(async () => {
		const [order, settings] = await Promise.all([getOrder(orderId), getSettings()]);
		if (!order) return;
		await sendEmail({ to: order.email, ...shippedEmail(settings.name, order, `${appUrl()}/account/orders/${order.id}`) });
	});
}
