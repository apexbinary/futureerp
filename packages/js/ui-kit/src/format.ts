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

/** Amount with a currency symbol (default ₹), Indian-grouped: "₹10,00,000.00". */
export function fmtMoney(
  value: number | string | null | undefined,
  { symbol = "₹", decimals = 2 }: { symbol?: string; decimals?: number } = {},
): string {
  return symbol + fmtAmount(value, { decimals });
}

/** Whole-number count with Indian grouping (no decimals): "12,34,567". */
export function fmtCount(value: number | string | null | undefined): string {
  return fmtAmount(value, { decimals: 0 });
}
