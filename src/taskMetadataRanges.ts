const TASK_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]/u;

/** A visible task detail, expressed as offsets within one Markdown line. */
export interface TaskMetadataRange {
  from: number;
  to: number;
}

/**
 * Finds only user-facing task details. Internal Memos Plus comments stay out
 * of this result so raw Markdown remains predictable to edit and select.
 */
export function taskMetadataRangesForLine(line: string): TaskMetadataRange[] {
  if (!TASK_LINE_RE.test(line)) return [];
  const ranges: TaskMetadataRange[] = [];
  const patterns = [
    /(?:📅|🛫|⏳|➕|✅)\s*\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?/gu,
    /⏰\s*\d{1,2}:\d{2}/gu,
    /(?:🔔|⏲️?)\s*(?:\d{1,2}:\d{2}|\d+\s*(?:分钟|小时))/gu,
    /[🔺⏫🔼🔽⏬]/gu,
    /🔁\s*[^\s<]+(?:\s+[^\s<#]+){0,3}/gu,
    /(?:^|\s)#(?:项目|project)\/[\w\-/一-鿿]+/giu
  ];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      const value = match[0] ?? "";
      const leading = value.length - value.trimStart().length;
      const from = (match.index ?? 0) + leading;
      const to = (match.index ?? 0) + value.length;
      if (to > from) ranges.push({ from, to });
    }
  }
  return mergeTaskMetadataRanges(ranges);
}

function mergeTaskMetadataRanges(ranges: TaskMetadataRange[]): TaskMetadataRange[] {
  const sorted = [...ranges].sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: TaskMetadataRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}
