/**
 * Query values accepted by the in-app link builders.
 *
 * `null`, `undefined` and blank strings remove a parameter; every other value
 * is written as text. Arrays are intentionally unsupported so callers cannot
 * accidentally rely on `URLSearchParams`' comma joining.
 */
export type LinkQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

function queryText(value: LinkQuery[string]): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function applyQuery(params: URLSearchParams, query: LinkQuery): void {
  for (const [key, value] of Object.entries(query)) {
    const text = queryText(value);
    if (text) {
      params.set(key, text);
    } else {
      params.delete(key);
    }
  }
}

/**
 * Reads a query parameter as trimmed text, capped to a sane length.
 *
 * The cap keeps a hand-edited URL from sending an arbitrarily long filter to
 * the API, matching the limits already applied to the register inputs.
 */
export function readSearchParam(
  params: URLSearchParams,
  key: string,
  maxLength = 64,
): string {
  return (params.get(key) ?? "").trim().slice(0, maxLength);
}

/**
 * Builds an in-app link that keeps the current evaluation date.
 *
 * Existing query parameters are preserved, and blank filter values are dropped
 * so a cleared select does not leave `?department=` in the URL. The default
 * date is omitted, matching the as-of control, so a shared link does not carry
 * redundant state.
 */
export function withAsOf(
  path: string,
  asOf: string,
  isDefault: boolean,
  query: LinkQuery = {},
): string {
  const [base, existing = ""] = path.split("?", 2);
  const params = new URLSearchParams(existing);
  applyQuery(params, query);

  if (!isDefault) {
    params.set("as_of", asOf);
  }

  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

/**
 * Returns a copy of the current URL parameters with filter updates applied.
 *
 * Unknown parameters (notably `as_of`) are retained unless the update names
 * them, so changing a register filter never drops the evaluation date.
 */
export function mergeSearchParams(
  current: URLSearchParams,
  updates: LinkQuery,
): URLSearchParams {
  const next = new URLSearchParams(current);
  applyQuery(next, updates);
  return next;
}
