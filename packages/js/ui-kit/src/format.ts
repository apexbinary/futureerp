/**
 * Shared number/money formatting.
 *
 * Uses the Indian numbering system (en-IN): thousands then lakhs/crores,
 * e.g. 1000000 → "10,00,000.00". Keep ALL amount displays going through these.
 */
export function fmtAmount(
  value: number | string | null | undefined,
  { decimals = 2 }: { decimals?: number } = {},
): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  if (n == null || !isFinite(n)) return (0).toFixed(decimals);
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£",
};

/** Symbol for a currency code, falling back to "<CODE> " for anything unmapped. */
export function currencySymbol(code?: string | null): string {
  if (!code) return "₹";
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/**
 * Amount with a currency symbol, Indian-grouped: "₹10,00,000.00".
 * Pass `currency` (the document's own ISO code, e.g. "USD") to get the right
 * symbol — it defaults to ₹/INR only because that's this app's base currency,
 * NOT because amounts are assumed to be rupees. An explicit `symbol` wins if given.
 */
export function fmtMoney(
  value: number | string | null | undefined,
  { symbol, currency, decimals = 2 }: { symbol?: string; currency?: string; decimals?: number } = {},
): string {
  return (symbol ?? currencySymbol(currency)) + fmtAmount(value, { decimals });
}

/** Whole-number count with Indian grouping (no decimals): "12,34,567". */
export function fmtCount(value: number | string | null | undefined): string {
  return fmtAmount(value, { decimals: 0 });
}
