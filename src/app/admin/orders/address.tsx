import type { Address } from "@/modules/customer/schema";

export function AddressBlock({ a }: { a: Address | null | undefined }) {
	if (!a) return <p className="text-sm text-muted-foreground">—</p>;
	return (
		<address className="text-sm not-italic leading-relaxed">
			{a.firstName} {a.lastName}<br />
			{a.company && <>{a.company}<br /></>}
			{a.address1}{a.address2 && `, ${a.address2}`}<br />
			{a.city}{a.province && `, ${a.province}`} {a.postalCode}<br />
			{a.countryCode}{a.phone && <><br />{a.phone}</>}
		</address>
	);
}
