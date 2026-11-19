/** Shared value type used by several modules (customer, cart, order). */
export type Address = {
	firstName: string;
	lastName: string;
	company?: string | null;
	address1: string;
	address2?: string | null;
	city: string;
	province?: string | null;
	postalCode?: string | null;
	countryCode: string;
	phone?: string | null;
};
