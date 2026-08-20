import type { TaskIndexItem } from "./taskIndex";

export function toggleTaskCheckbox(line: string): string {
  return line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([^\]])(]\s+)/, (_match, prefix: string, status: string, suffix: string) => {
    return `${prefix}${status.trim() ? " " : "x"}${suffix}`;
  });
}

export function toggleTaskCheckboxWithRecurrence(line: string, now = new Date()): string {
  if (taskIsCompleted(line)) {
    return toggleTaskCheckbox(line).replace(/\s+✅\s*\d{4}-\d{2}-\d{2}/gu, "");
  }
  const completed = appendDoneDate(toggleTaskCheckbox(line), formatLocalDate(now));
  const recurrence = taskRecurrenceRule(line);
  if (!recurrence) return completed;
  const anchor = taskRecurrenceAnchor(line);
  const nextAnchor = anchor ? nextRecurrenceDate(anchor, recurrence) : "";
  if (!anchor || !nextAnchor) return completed;
  const dayOffset = daysBetween(anchor, nextAnchor);
  const next = line
    .replace(/<!--\s*memos-plus-apple-id:[^\s>]+\s*-->/gu, "")
    .replace(/\s+✅\s*\d{4}-\d{2}-\d{2}/gu, "")
    .replace(/(🛫|⏳|📅)\s*(\d{4}-\d{2}-\d{2})/gu, (_match, marker: string, date: string) => `${marker} ${addDays(date, dayOffset)}`)
    .replace(/\s{2,}/gu, " ")
    .trimEnd();
  return `${completed}\n${next}`;
}

export function completeTaskWithRecurrence(line: string, now = new Date()): string {
  const open = line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[).(\x5d\s+)/u, "$1 $2");
  return toggleTaskCheckboxWithRecurrence(open, now);
}

export function taskRecurrenceRule(line: string): string {
  const marker = line.indexOf("🔁");
  if (marker < 0) return "";
  const tail = line.slice(marker + "🔁".length).trimStart();
  const stop = tail.search(/\s+(?=(?:🔺|⏫|🔼|🔽|⏬|🛫|⏳|📅|⏰|➕|✅|#|<!--))/u);
  return (stop < 0 ? tail : tail.slice(0, stop)).trim();
}

function taskIsCompleted(line: string): boolean {
  const status = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]/u)?.[1] ?? "";
  return Boolean(status.trim());
}

function appendDoneDate(line: string, date: string): string {
  const clean = line.replace(/\s+✅\s*\d{4}-\d{2}-\d{2}/gu, "");
  const commentIndex = clean.indexOf("<!--");
  if (commentIndex < 0) return `${clean.trimEnd()} ✅ ${date}`;
  return `${clean.slice(0, commentIndex).trimEnd()} ✅ ${date} ${clean.slice(commentIndex).trimStart()}`;
}

function taskRecurrenceAnchor(line: string): string {
  for (const marker of ["📅", "⏳", "🛫"]) {
    const date = line.match(new RegExp(`${marker}\\s*(\\d{4}-\\d{2}-\\d{2})`, "u"))?.[1];
    if (date) return date;
  }
  return "";
}

function nextRecurrenceDate(date: string, rule: string): string {
  const normalized = rule.trim().toLocaleLowerCase();
  if (normalized === "every weekday") return nextWeekday(date);
  if (normalized === "every day" || normalized === "daily") return addDays(date, 1);
  if (normalized === "every week" || normalized === "weekly") return addDays(date, 7);
  if (normalized === "every month" || normalized === "monthly") return addMonths(date, 1);
  if (normalized === "every year" || normalized === "yearly") return addYears(date, 1);
  const interval = normalized.match(/^every\s+(\d+)\s+(days?|weeks?|months?|years?)$/u);
  if (interval) {
    const amount = Number(interval[1]);
    const unit = interval[2];
    if (unit.startsWith("day")) return addDays(date, amount);
    if (unit.startsWith("week")) return addDays(date, amount * 7);
    if (unit.startsWith("month")) return addMonths(date, amount);
    if (unit.startsWith("year")) return addYears(date, amount);
  }
  const weekday = normalized.match(/^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/u)?.[1];
  if (weekday) return nextNamedWeekday(date, ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday));
  const weeklyWeekday = normalized.match(/^every\s+week\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/u)?.[1];
  if (weeklyWeekday) return nextNamedWeekday(date, ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weeklyWeekday));
  const monthlyDay = normalized.match(/^every\s+month\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)$/u)?.[1];
  if (monthlyDay) return nextMonthDay(date, Number(monthlyDay));
  const yearlyDate = normalized.match(/^every\s+year\s+on\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})$/u);
  if (yearlyDate) return nextYearMonthDay(date, monthNumber(yearlyDate[1]), Number(yearlyDate[2]));
  return "";
}

function nextWeekday(date: string): string {
  let next = addDays(date, 1);
  while ([0, 6].includes(parseLocalDate(next).getDay())) next = addDays(next, 1);
  return next;
}

function nextNamedWeekday(date: string, weekday: number): string {
  const current = parseLocalDate(date);
  const offset = (weekday - current.getDay() + 7) % 7 || 7;
  return addDays(date, offset);
}

function nextMonthDay(date: string, day: number): string {
  const current = parseLocalDate(date);
  let candidate = dateWithDay(current.getFullYear(), current.getMonth(), day);
  if (!candidate || candidate.getTime() <= current.getTime()) candidate = dateWithDay(current.getFullYear(), current.getMonth() + 1, day);
  return candidate ? formatLocalDate(candidate) : "";
}

function nextYearMonthDay(date: string, month: number, day: number): string {
  const current = parseLocalDate(date);
  let candidate = dateWithDay(current.getFullYear(), month - 1, day);
  if (!candidate || candidate.getTime() <= current.getTime()) candidate = dateWithDay(current.getFullYear() + 1, month - 1, day);
  return candidate ? formatLocalDate(candidate) : "";
}

function dateWithDay(year: number, monthIndex: number, day: number): Date | null {
  const base = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const candidate = new Date(base.getFullYear(), base.getMonth(), day, 12, 0, 0, 0);
  return candidate.getMonth() === base.getMonth() ? candidate : null;
}

function monthNumber(value: string): number {
  return ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(value) + 1;
}

function addDays(date: string, amount: number): string {
  const next = parseLocalDate(date);
  next.setDate(next.getDate() + amount);
  return formatLocalDate(next);
}

function addMonths(date: string, amount: number): string {
  const source = parseLocalDate(date);
  const day = source.getDate();
  const next = new Date(source.getFullYear(), source.getMonth() + amount, 1, 12, 0, 0, 0);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return formatLocalDate(next);
}

function addYears(date: string, amount: number): string {
  const source = parseLocalDate(date);
  const next = new Date(source.getFullYear() + amount, source.getMonth(), 1, 12, 0, 0, 0);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
  next.setDate(Math.min(source.getDate(), lastDay));
  return formatLocalDate(next);
}

function daysBetween(left: string, right: string): number {
  return Math.round((parseLocalDate(right).getTime() - parseLocalDate(left).getTime()) / 86_400_000);
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatLocalDate(value: Date): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
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
