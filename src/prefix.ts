export type MemoDefaultPrefix = "none" | "list" | "task";

export function applyDefaultPrefix(content: string, prefix: MemoDefaultPrefix): string {
  if (prefix === "none" || content.trim() === "") {
    return content;
  }
  const lines = content.split("\n");
  const targetIndex = lines.findIndex((line) => line.trim() !== "");
  if (targetIndex < 0 || hasMarkdownPrefix(lines[targetIndex])) {
    return content;
  }
  lines[targetIndex] = `${prefixText(prefix)}${lines[targetIndex]}`;
  return lines.join("\n");
}

function hasMarkdownPrefix(line: string): boolean {
  return /^\s*(?:>|\d+\.\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+)/.test(line);
}

function prefixText(prefix: MemoDefaultPrefix): string {
  return prefix === "task" ? "- [ ] " : "- ";
}
