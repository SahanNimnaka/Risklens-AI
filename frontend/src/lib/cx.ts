/** Joins truthy class names without adding a dependency. */
export function cx(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
