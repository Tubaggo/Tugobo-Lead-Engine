/**
 * v3.7.8 — HOT_NOW URL state persistence.
 *
 * Pure URL <-> operational-filter contract so the exact HOT_NOW mode survives
 * refresh and browser back/forward. No React, no DOM — just string/URL math,
 * so the contract is unit-testable. The dashboard reads/writes the URL through
 * these helpers using the History API (same raw approach the section rail uses).
 */

/** Query key carrying the active exact operational filter. */
export const OPERATION_QUERY_KEY = "operation";

/** The only operational filter that is URL-persisted today. */
export type OperationUrlFilter = "hot_now";

/**
 * Reads the operational filter from a `location.search` string. Any missing,
 * unknown or malformed value resolves to `null` (never throws), so an invalid
 * `?operation=` can never crash hydration or arm a bogus filter.
 */
export function parseOperationFilter(search: string): OperationUrlFilter | null {
  try {
    // `location.search` never carries a fragment, but stay robust if a fuller
    // string is handed in.
    const query = search.split("#")[0];
    const params = new URLSearchParams(query);
    return params.get(OPERATION_QUERY_KEY) === "hot_now" ? "hot_now" : null;
  } catch {
    return null;
  }
}

/**
 * Builds a relative URL (`pathname + search + hash`) from an absolute `href`,
 * setting or removing the operation query and, when provided, replacing the
 * hash. Other query params are preserved.
 */
export function buildOperationUrl(
  href: string,
  op: OperationUrlFilter | null,
  hash?: string,
): string {
  const url = new URL(href);
  if (op) url.searchParams.set(OPERATION_QUERY_KEY, op);
  else url.searchParams.delete(OPERATION_QUERY_KEY);
  if (hash !== undefined) url.hash = hash;
  return `${url.pathname}${url.search}${url.hash}`;
}
