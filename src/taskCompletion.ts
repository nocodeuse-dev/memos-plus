import {
  attachMemosPlusTaskMetadata,
  normalizeTaskCompletionAt,
  parseMemosPlusTaskMetadata,
  stripMemosPlusTaskMetadata,
  type MemosPlusTaskMetadata
} from "./tasksFormat";

const DONE_DATE_RE = /\s+✅\s*\d{4}-\d{2}-\d{2}/gu;

/** Format a local wall-clock completion time without converting it to UTC. */
export function formatTaskCompletionAt(value = new Date()): string {
  return [
    formatDate(value),
    "T",
    pad2(value.getHours()),
    ":",
    pad2(value.getMinutes()),
    ":",
    pad2(value.getSeconds())
  ].join("");
}

export function taskCompletionDate(value: unknown): string {
  return normalizeTaskCompletionAt(value).slice(0, 10);
}

export function taskCompletionTime(value: unknown): string {
  return normalizeTaskCompletionAt(value).slice(11, 16);
}

export function taskCompletionDateTime(value: unknown): Date | null {
  const normalized = normalizeTaskCompletionAt(value);
  if (!normalized) return null;
  const [date, time] = normalized.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes, seconds] = time.split(":").map(Number);
  const parsed = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Mark a Markdown task as done while preserving the standard Tasks date token
 * and adding Memos Plus' exact completion timestamp to hidden metadata.
 */
export function markTaskCompletedAt(line: string, value = new Date()): string {
  const completedAt = formatTaskCompletionAt(value);
  const withDoneDate = appendDoneDate(line, taskCompletionDate(completedAt));
  const metadata = parseMemosPlusTaskMetadata(withDoneDate);
  return attachMemosPlusTaskMetadata(withDoneDate, {
    ...(metadata ?? { target: "tasks" }),
    target: metadata?.target ?? "tasks",
    completedAt
  });
}

/**
 * Clear both completion representations. Other Memos Plus metadata remains
 * intact, so changing a completed Reminder back to open cannot lose timing or
 * sync settings.
 */
export function clearTaskCompletedAt(line: string): string {
  const withoutDoneDate = line.replace(DONE_DATE_RE, "").replace(/\s{2,}/gu, " ").trimEnd();
  return clearTaskCompletionTimestampMetadata(withoutDoneDate);
}

/** Remove only the precise timestamp while retaining the visible Tasks done date. */
export function clearTaskCompletionTimestampMetadata(line: string): string {
  const metadata = parseMemosPlusTaskMetadata(line);
  if (!metadata) return line;
  const next = withoutCompletionMetadata(metadata);
  return metadataNeedsMarker(next)
    ? attachMemosPlusTaskMetadata(line, next)
    : stripMemosPlusTaskMetadata(line);
}

/** Apply the correct completion metadata to the first task line returned by a Tasks API command. */
export function synchronizeTaskCompletionAt(line: string, value = new Date()): string {
  const [first = "", ...remaining] = line.split(/\r?\n/);
  const updated = isTaskCompleted(first) ? markTaskCompletedAt(first, value) : clearTaskCompletedAt(first);
  return [updated, ...remaining].join("\n");
}

export function isTaskCompleted(line: string): boolean {
  const status = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]/u)?.[1] ?? "";
  return Boolean(status.trim());
}

function appendDoneDate(line: string, date: string): string {
  const clean = line.replace(DONE_DATE_RE, "").replace(/\s{2,}/gu, " ").trimEnd();
  const commentIndex = clean.indexOf("<!--");
  if (commentIndex < 0) return `${clean} ✅ ${date}`;
  return `${clean.slice(0, commentIndex).trimEnd()} ✅ ${date} ${clean.slice(commentIndex).trimStart()}`;
}

function withoutCompletionMetadata(metadata: MemosPlusTaskMetadata): MemosPlusTaskMetadata {
  const next = { ...metadata };
  delete next.completedAt;
  return next;
}

function metadataNeedsMarker(metadata: MemosPlusTaskMetadata): boolean {
  return Object.entries(metadata).some(([key, value]) => key !== "target" && value !== "" && value !== undefined && value !== false);
}

function formatDate(value: Date): string {
  return [value.getFullYear(), pad2(value.getMonth() + 1), pad2(value.getDate())].join("-");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
