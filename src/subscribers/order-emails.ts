import { getOrder } from "@/modules/order/service";
import { getSettings } from "@/modules/store/service";
import { adminEmails } from "@/modules/auth/service";
import { sendEmail } from "@/modules/notification/email";
import { adminNewOrderEmail, orderConfirmationEmail, shippedEmail } from "@/modules/notification/templates";
import { appUrl } from "@/lib/env";
import { hasFeature } from "@/lib/plan";

/** Link to the customer dashboard, or none on plans without customer accounts. */
const orderUrl = (id: string) => (hasFeature("customerAccounts") ? `${appUrl()}/account/orders/${id}` : null);

export async function sendOrderConfirmation({ id }: { id: string }) {
	const [order, settings] = await Promise.all([getOrder(id), getSettings()]);
	if (!order) return;
	await sendEmail({ to: order.email, ...orderConfirmationEmail(settings.name, order, orderUrl(order.id)), replyTo: settings.supportEmail ?? undefined });
}

export async function notifyAdminsOfOrder({ id }: { id: string }) {
	const [order, settings] = await Promise.all([getOrder(id), getSettings()]);
	if (!order) return;
	const to = settings.supportEmail ? [settings.supportEmail] : await adminEmails();
	if (to.length) await sendEmail({ to, ...adminNewOrderEmail(settings.name, order, `${appUrl()}/admin/orders/${order.id}`) });
}

export async function sendShippedEmail({ id }: { id: string }) {
	const [order, settings] = await Promise.all([getOrder(id), getSettings()]);
	if (order) await sendEmail({ to: order.email, ...shippedEmail(settings.name, order, orderUrl(order.id)) });
}
