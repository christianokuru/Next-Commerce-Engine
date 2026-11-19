"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/server/session";
import { addAddress, deleteAddress, updateCustomer } from "@/modules/customer/service";
import { address } from "@/lib/validators";
import { f, formObject, toActionError, type ActionState } from "@/lib/action";

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
	try {
		const { customer } = await requireCustomer();
		const o = z.object({ firstName: f.optText(100), lastName: f.optText(100), phone: f.optText(30) }).parse(formObject(fd));
		await updateCustomer(customer.id, o);
		revalidatePath("/account");
		return { ok: true, message: "Profile updated" };
	} catch (e) {
		return toActionError(e);
	}
}

export async function addAddressAction(_: ActionState, fd: FormData): Promise<ActionState> {
	try {
		const { customer } = await requireCustomer();
		const o = formObject(fd);
		await addAddress(customer.id, address.parse(o), o.isDefault === "on");
		revalidatePath("/account/addresses");
		return { ok: true, message: "Address saved" };
	} catch (e) {
		return toActionError(e);
	}
}

export async function deleteAddressAction(_: ActionState, fd: FormData): Promise<ActionState> {
	try {
		const { customer } = await requireCustomer();
		await deleteAddress(customer.id, z.string().parse(fd.get("id")));
		revalidatePath("/account/addresses");
		return { ok: true, message: "Address removed" };
	} catch (e) {
		return toActionError(e);
	}
}
