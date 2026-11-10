/** Joins truthy class names (tiny local stand-in for clsx). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
