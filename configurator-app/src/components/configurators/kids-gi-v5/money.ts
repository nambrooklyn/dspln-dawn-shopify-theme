/**
 * One money formatter for the v5 surfaces (#9 — the rail, the bag and the
 * summary drawer each rolled their own, so the same total read "$115" in one
 * place and "$115.00" in another).
 *
 * Compact form for the always-on chrome, where the label is 8-10px and cents
 * are noise; cents everywhere the price is itemized, which is what the live
 * site's price sidebar does.
 */
export function formatUsd(value: number, { compact = false } = {}) {
  return compact ? `$${value}` : `$${value}.00`;
}
