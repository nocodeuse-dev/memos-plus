export type TaskPriority = "none" | "highest" | "high" | "medium" | "low" | "lowest";
export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type TaskContentMode = "task-with-detail" | "task-only" | "ask";
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
}

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
  weekly: "every week",
  monthly: "every month",
  yearly: "every year"
};

export function buildTasksMarkdownLine(content: string, options: TasksMarkdownOptions = {}, now = new Date()): string {
  const body = normalizeTaskContent(content);
  const tokens = [
    normalizeTaskProjectTag(options.projectTag),
    priorityMarkers[normalizeTaskPriority(options.priority)],
    recurrenceToken(options),
    dateToken("🛫", options.startDate),
    dateToken("⏳", options.scheduledDate),
    dateToken("📅", options.dueDate),
    options.addCreatedDate ? dateToken("➕", options.createdDate || formatDate(now)) : "",
    dateToken("✅", options.doneDate)
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
  if (Object.values(priorityMarkers).includes(token as TaskPriority)) {
    return Object.values(priorityMarkers).some((marker) => marker && body.includes(marker));
  }
  if (token.startsWith("🔁")) {
    return body.includes("🔁");
  }
  const marker = token.slice(0, 2).trim();
  if (["🛫", "⏳", "📅", "➕", "✅"].includes(marker)) {
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
