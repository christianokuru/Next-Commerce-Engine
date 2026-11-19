import type { DomainEvents } from "@/lib/events";
import { sendOrderConfirmation, notifyAdminsOfOrder, sendShippedEmail } from "./order-emails";

type Handlers = { [E in keyof DomainEvents]?: ((payload: DomainEvents[E]) => Promise<void>)[] };

/** Register event subscribers here. */
export const subscribers: Handlers = {
	"order.placed": [sendOrderConfirmation, notifyAdminsOfOrder],
	"order.shipped": [sendShippedEmail],
};
