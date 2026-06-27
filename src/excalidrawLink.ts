export function formatExcalidrawMarkdownLink(linkText: string): string {
  return `[[${linkText}]]`;
}

export interface ExcalidrawMarkdownInsertionContext {
  before: string;
  after: string;
}

export function formatExcalidrawMarkdownInsertion(linkText: string, context: ExcalidrawMarkdownInsertionContext): string {
  const link = formatExcalidrawMarkdownLink(linkText);
  const prefix = context.before.trim().length > 0 ? "\n\n" : "";
  const suffix = context.after.trim().length > 0 ? "\n\n" : "\n";
  return `${prefix}${link}${suffix}`;
}
