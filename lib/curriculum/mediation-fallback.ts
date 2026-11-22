/** Empty mediation is expected except at the four-week checkpoints. */
export function resolveMediation<T>(
  week: number,
  published: T | null | undefined,
  bundled: T | null | undefined,
  warn: (message: string) => void = console.warn,
): T | null | undefined {
  const hasContent = (value: unknown) =>
    Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);

  if (hasContent(published)) return published;
  if (week > 0 && week % 4 === 0) {
    warn(`[syllabus] Week ${week}: published mediation task is empty; ${hasContent(bundled) ? 'using bundled content' : 'no bundled task is available'}`);
  }
  return bundled;
}
