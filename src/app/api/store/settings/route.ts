import { route, preflight } from "@/lib/http";
import { getSettings } from "@/modules/store/service";
import { availableProviders } from "@/workflows/checkout";

export const OPTIONS = preflight;
export const GET = route(async () => {
	const s = await getSettings();
	const providers = Object.fromEntries(await Promise.all(s.currencies.map(async (c) => [c, await availableProviders(c)] as const)));
	return {
		name: s.name, logoUrl: s.logoUrl, defaultCurrency: s.defaultCurrency, currencies: s.currencies,
		taxInclusive: s.taxInclusive, paymentProviders: providers,
	};
});
