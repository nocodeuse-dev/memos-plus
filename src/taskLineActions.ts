import type { TaskIndexItem } from "./taskIndex";

export function toggleTaskCheckbox(line: string): string {
  return line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([^\]])(]\s+)/, (_match, prefix: string, status: string, suffix: string) => {
    return `${prefix}${status.trim() ? " " : "x"}${suffix}`;
  });
}

export function replaceIndexedTaskLine(
  source: string,
  task: Pick<TaskIndexItem, "line" | "lineNumber">,
  replacement: string
): { source: string; updated: boolean } {
  const lines = source.split(/\r?\n/);
  const index = task.lineNumber - 1;
  if (index < 0 || index >= lines.length || lines[index] !== task.line) {
    return { source, updated: false };
  }
  const replacementLines = replacement ? replacement.split(/\r?\n/) : [];
  lines.splice(index, 1, ...replacementLines);
  return {
    source: lines.join(source.includes("\r\n") ? "\r\n" : "\n"),
    updated: true
  };
}
