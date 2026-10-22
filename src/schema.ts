/** One schema issue. Structurally compatible with zod 3 and zod 4 issues. */
export interface ValidationIssue {
  readonly message: string;
  readonly path: ReadonlyArray<PropertyKey>;
  readonly code?: string;
}

/**
 * Anything with a zod-like `safeParse`: zod 3, zod 4 (classic) schemas or a hand-written object.
 * The library does not depend on zod.
 */
export interface ValidationSchema<T> {
  safeParse(data: unknown):
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: { readonly issues: ReadonlyArray<ValidationIssue> };
      };
}

/** Short human-readable summary of issues: first three, then `… +N`. */
export function formatIssues(issues: ReadonlyArray<ValidationIssue>): string {
  const shown = issues
    .slice(0, 3)
    .map((i) => `${i.path.length ? i.path.map(String).join(".") : "(root)"}: ${i.message}`);
  if (issues.length > 3) shown.push(`… +${issues.length - 3}`);
  return shown.join("; ");
}
