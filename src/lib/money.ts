/** All amounts are integers in the currency's minor unit (kobo, cents...). */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "XOF", "XAF", "UGX", "RWF", "CLP", "PYG"]);

export function minorUnitDigits(currency: string) {
	return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function toMinor(major: number | string, currency: string) {
	const n = typeof major === "string" ? Number(major) : major;
	if (!Number.isFinite(n)) throw new Error("Invalid amount");
	return Math.round(n * 10 ** minorUnitDigits(currency));
}

export function toMajor(minor: number, currency: string) {
	return minor / 10 ** minorUnitDigits(currency);
}

export function formatMoney(minor: number, currency: string, locale = "en-NG") {
	return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(
		toMajor(minor, currency),
	);
}
