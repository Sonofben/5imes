/** Website price display in other currencies. Billing itself is in naira. */
export type DisplayCurrency = { code: string; name: string; symbol: string; ngnPerUnit: number; markupPct: number };

export const NAIRA: DisplayCurrency = { code: "NGN", name: "Nigerian naira", symbol: "₦", ngnPerUnit: 1, markupPct: 0 };

export function convertFromNaira(ngn: number, c: DisplayCurrency) {
  if (c.code === "NGN") return ngn;
  return (ngn / c.ngnPerUnit) * (1 + c.markupPct / 100);
}

export function formatMoney(value: number, c: DisplayCurrency) {
  if (c.code === "NGN") return `₦${Math.round(value).toLocaleString("en-NG")}`;
  const digits = value >= 100 ? 0 : 2;
  return new Intl.NumberFormat("en", { style: "currency", currency: c.code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** A sensible first choice from the visitor's time zone; they can always change it. */
export function guessCurrency(timeZone: string, available: string[]): string {
  const pick = (code: string) => (available.includes(code) ? code : "NGN");
  if (timeZone === "Africa/Lagos") return "NGN";
  if (timeZone === "Europe/London" || timeZone === "Europe/Belfast" || timeZone === "Europe/Guernsey" || timeZone === "Europe/Jersey" || timeZone === "Europe/Isle_of_Man") return pick("GBP");
  if (timeZone.startsWith("Europe/")) return pick("EUR");
  if (timeZone.startsWith("America/") || timeZone.startsWith("US/") || timeZone.startsWith("Pacific/Honolulu")) return pick("USD");
  if (timeZone) return pick("USD");
  return "NGN";
}
