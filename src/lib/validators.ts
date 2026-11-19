import { z } from "zod";

export const currency = z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter ISO currency code").transform((s) => s.toUpperCase());
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const minorAmount = z.number().int().min(0).max(1_000_000_000_000);

export const address = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	company: z.string().trim().max(200).nullish(),
	address1: z.string().trim().min(1).max(300),
	address2: z.string().trim().max(300).nullish(),
	city: z.string().trim().min(1).max(100),
	province: z.string().trim().max(100).nullish(),
	postalCode: z.string().trim().max(20).nullish(),
	countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()),
	phone: z.string().trim().max(30).nullish(),
});

export const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[0-9A-Z]{26}$`), "Invalid id");
