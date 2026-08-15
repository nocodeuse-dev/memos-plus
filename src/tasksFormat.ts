export type TaskPriority = "none" | "highest" | "high" | "medium" | "low" | "lowest";
export type TaskRecurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";
export type TaskContentMode = "task-with-detail" | "task-only" | "ask";
export type TaskSyncTarget = "tasks" | "reminders" | "calendar";
type LooseTaskPriority = TaskPriority | (string & {});
type LooseTaskRecurrence = TaskRecurrence | (string & {});

export interface TasksMarkdownOptions {
  priority?: LooseTaskPriority;
  projectTag?: string;
  startDate?: string;
  scheduledDate?: string;
  dueDate?: string;
  recurrence?: LooseTaskRecurrence;
  customRecurrence?: string;
  addCreatedDate?: boolean;
  createdDate?: string;
  doneDate?: string;
  syncTarget?: TaskSyncTarget;
  syncTag?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  dueTime?: string;
  reminderDate?: string;
  reminderTime?: string;
  reminderMinutesBefore?: number;
  allDay?: boolean;
}

export interface MemosPlusTaskMetadata {
  target: Exclude<TaskSyncTarget, "tasks">;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  dueTime?: string;
  reminderDate?: string;
  reminderTime?: string;
  reminderMinutesBefore?: number;
  allDay?: boolean;
  recurrence?: string;
}

// Older damaged sync rounds may contain `memos-plus-task- meta` (with
// horizontal whitespace before `meta`). Match that legacy form as well as the
// canonical marker, and always treat every occurrence on the task line as
// internal metadata. Deliberately avoid `\s` here so a marker cannot consume
// across Markdown lines.
const TASK_METADATA_RE = /<!--[ \t]*memos-plus-task-[ \t]*meta[ \t]*:[ \t]*([^\s>]+)[ \t]*-->/giu;

export interface ProjectTaskOptions extends TasksMarkdownOptions {
  isTask: boolean;
  contentMode?: TaskContentMode;
}

const priorityMarkers: Record<TaskPriority, string> = {
  none: "",
  highest: "🔺",
  high: "⏫",
  medium: "🔼",
  low: "🔽",
  lowest: "⏬"
};

const recurrenceRules: Record<Exclude<TaskRecurrence, "none" | "custom">, string> = {
  daily: "every day",
  weekdays: "every weekday",
  weekly: "every week",
  monthly: "every month",
  yearly: "every year"
};

export function buildTasksMarkdownLine(content: string, options: TasksMarkdownOptions = {}, now = new Date()): string {
  const body = stripMemosPlusTaskMetadata(normalizeTaskContent(content));
  const tokens = [
    normalizeTaskProjectTag(options.projectTag),
    priorityMarkers[normalizeTaskPriority(options.priority)],
    recurrenceToken(options),
    dateToken("🛫", options.startDate),
    dateToken("⏳", options.scheduledDate),
    dateToken("📅", options.dueDate),
    timeToken(options.dueTime),
    options.addCreatedDate ? dateToken("➕", options.createdDate || formatDate(now)) : "",
    dateToken("✅", options.doneDate),
    normalizeTaskSyncTag(options),
    taskMetadataToken(options)
  ].filter((token) => token && !taskBodyAlreadyHasToken(body, token));

  return `- [ ] ${[body, ...tokens].filter(Boolean).join(" ")}`;
}

export function normalizeTaskPriority(value: unknown): TaskPriority {
  if (typeof value !== "string") {
    return "medium";
  }
  const normalized = value.trim().toLowerCase();
  if (["none", "无", "不设置"].includes(normalized)) {
    return "none";
  }
  if (["highest", "最高", "🔺"].includes(normalized)) {
    return "highest";
  }
  if (["high", "高", "⏫"].includes(normalized)) {
    return "high";
  }
  if (["medium", "中", "普通", "🔼"].includes(normalized)) {
    return "medium";
  }
  if (["low", "低", "🔽"].includes(normalized)) {
    return "low";
  }
  if (["lowest", "最低", "⏬", "⏬️"].includes(normalized)) {
    return "lowest";
  }
  return "medium";
}

export function normalizeTaskRecurrence(value: unknown): TaskRecurrence {
  if (typeof value !== "string") {
    return "none";
  }
  const normalized = value.trim().toLowerCase();
  if (["custom", "自定义"].includes(normalized)) {
    return "custom";
  }
  if (["daily", "day", "每天", "每日", "every day"].includes(normalized)) {
    return "daily";
  }
  if (["weekdays", "weekday", "工作日", "每个工作日", "every weekday"].includes(normalized)) {
    return "weekdays";
  }
  if (["weekly", "week", "每周", "每星期", "every week"].includes(normalized)) {
    return "weekly";
  }
  if (["monthly", "month", "每月", "every month"].includes(normalized)) {
    return "monthly";
  }
  if (["yearly", "year", "annually", "每年", "every year"].includes(normalized)) {
    return "yearly";
  }
  return "none";
}

export function normalizeTaskDate(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export function normalizeTaskProjectTag(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return normalized ? `#${normalized}` : "";
}

export function normalizeTaskTime(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTaskSyncTarget(value: unknown): TaskSyncTarget {
  return value === "calendar" || value === "reminders" ? value : "tasks";
}

export function parseMemosPlusTaskMetadata(line: string): MemosPlusTaskMetadata | undefined {
  const encodedValues = Array.from(line.matchAll(TASK_METADATA_RE), (match) => match[1]).reverse();
  for (const encoded of encodedValues) {
    try {
      const parsed = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
      const target = normalizeTaskSyncTarget(parsed.target);
      if (target === "tasks") continue;
      return compactMetadata({
        target,
        startTime: normalizeTaskTime(parsed.startTime),
        endDate: normalizeTaskDate(parsed.endDate),
        endTime: normalizeTaskTime(parsed.endTime),
        dueTime: normalizeTaskTime(parsed.dueTime),
        reminderDate: normalizeTaskDate(parsed.reminderDate),
        reminderTime: normalizeTaskTime(parsed.reminderTime),
        reminderMinutesBefore: normalizeReminderMinutes(parsed.reminderMinutesBefore),
        allDay: parsed.allDay === true,
        recurrence: typeof parsed.recurrence === "string" ? parsed.recurrence.trim() : ""
      });
    } catch {
      // Keep looking from newest to oldest so one damaged duplicate cannot hide
      // a valid canonical marker later on the line.
    }
  }
  return undefined;
}

export function stripMemosPlusTaskMetadata(line: string): string {
  return line.replace(TASK_METADATA_RE, "").replace(/\s{2,}/g, " ").trimEnd();
}

export function attachMemosPlusTaskMetadata(line: string, metadata: MemosPlusTaskMetadata): string {
  const clean = stripMemosPlusTaskMetadata(line);
  return `${clean} <!-- memos-plus-task-meta:${encodeURIComponent(JSON.stringify(compactMetadata(metadata)))} -->`;
}

export function canonicalizeMemosPlusTaskMetadata(line: string): string {
  const metadata = parseMemosPlusTaskMetadata(line);
  return metadata ? attachMemosPlusTaskMetadata(line, metadata) : stripMemosPlusTaskMetadata(line);
}

function recurrenceToken(options: TasksMarkdownOptions): string {
  const recurrence = normalizeTaskRecurrence(options.recurrence);
  if (recurrence === "none") {
    return "";
  }
  if (recurrence === "custom") {
    const custom = typeof options.customRecurrence === "string" ? options.customRecurrence.trim().replace(/^🔁\s*/, "") : "";
    return custom ? `🔁 ${custom}` : "";
  }
  return `🔁 ${recurrenceRules[recurrence]}`;
}

function dateToken(marker: string, value: unknown): string {
  const date = normalizeTaskDate(value);
  return date ? `${marker} ${date}` : "";
}

function timeToken(value: unknown): string {
  const time = normalizeTaskTime(value);
  return time ? `⏰ ${time}` : "";
}

function normalizeTaskSyncTag(options: TasksMarkdownOptions): string {
  if (normalizeTaskSyncTarget(options.syncTarget) === "tasks") return "";
  return normalizeTaskProjectTag(options.syncTag);
}

function taskMetadataToken(options: TasksMarkdownOptions): string {
  const target = normalizeTaskSyncTarget(options.syncTarget);
  if (target === "tasks") return "";
  const metadata = compactMetadata({
    target,
    startTime: normalizeTaskTime(options.startTime),
    endDate: normalizeTaskDate(options.endDate),
    endTime: normalizeTaskTime(options.endTime),
    dueTime: normalizeTaskTime(options.dueTime),
    reminderDate: normalizeTaskDate(options.reminderDate),
    reminderTime: normalizeTaskTime(options.reminderTime),
    reminderMinutesBefore: normalizeReminderMinutes(options.reminderMinutesBefore),
    allDay: options.allDay === true,
    recurrence: metadataRecurrence(options)
  });
  return `<!-- memos-plus-task-meta:${encodeURIComponent(JSON.stringify(metadata))} -->`;
}

function compactMetadata(metadata: MemosPlusTaskMetadata): MemosPlusTaskMetadata {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== "" && value !== undefined && value !== false)) as unknown as MemosPlusTaskMetadata;
}

function normalizeReminderMinutes(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10080 ? Math.round(number) : undefined;
}

function metadataRecurrence(options: TasksMarkdownOptions): string {
  const recurrence = normalizeTaskRecurrence(options.recurrence);
  if (recurrence === "none") return "";
  if (recurrence === "custom") return typeof options.customRecurrence === "string" ? options.customRecurrence.trim() : "";
  return recurrence;
}

function normalizeTaskContent(value: string): string {
  let normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
  let previous = "";
  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^[-*+]\s+\[[ xX]\]\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .trim();
  }
  return normalized;
}

function taskBodyAlreadyHasToken(body: string, token: string): boolean {
  if (!token) {
    return false;
  }
  if (token.startsWith("#")) {
    return body.split(/\s+/).includes(token);
  }
  if (isPriorityMarker(token)) {
    return Object.values(priorityMarkers).some((marker) => marker && body.includes(marker));
  }
  if (token.startsWith("🔁")) {
    return body.includes("🔁");
  }
  const marker = token.slice(0, 2).trim();
  if (["🛫", "⏳", "📅", "➕", "✅", "⏰"].includes(marker)) {
    return body.includes(marker);
  }
  return body.includes(token);
}

function formatDate(date: Date): string {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isPriorityMarker(value: string): boolean {
  return Object.values(priorityMarkers).includes(value as (typeof priorityMarkers)[TaskPriority]);
}
