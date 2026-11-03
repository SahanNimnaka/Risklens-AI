/**
 * Builds an in-app link that keeps the current evaluation date.
 *
 * The default date is omitted from the URL, matching the as-of control, so a
 * shared link does not carry redundant state.
 */
export function withAsOf(
  path: string,
  asOf: string,
  isDefault: boolean,
): string {
  if (isDefault) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}as_of=${encodeURIComponent(asOf)}`;
}
