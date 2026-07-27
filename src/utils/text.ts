/** Strips diacritics: "écologie" becomes "ecologie". */
export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Lowercase and accent-free form, for comparing freely typed labels. */
export function normalizeLabel(input: string): string {
  return stripAccents(input.trim().toLowerCase());
}

/** Collapses whitespace and newlines for single-line display. */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/** Truncates on a word boundary. */
export function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  const cut = input.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
