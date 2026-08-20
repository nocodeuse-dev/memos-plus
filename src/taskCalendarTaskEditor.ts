import { parseTaskIndexItemsFromMarkdown, type TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";
import {
  attachMemosPlusTaskMetadata,
  normalizeTaskRecurrence,
  parseMemosPlusTaskMetadata,
  stripMemosPlusTaskMetadata,
  type TaskSyncTarget,
  type TaskRecurrence
} from "./tasksFormat";

export interface TaskCalendarDetailMetadata {
  notes?: string;
  relatedNote?: string;
}

export interface TaskCalendarTaskPatch {
  title?: string;
  date?: string;
  time?: string;
  reminderDate?: string;
  reminderTime?: string;
  reminderMinutesBefore?: number | null;
  priority?: TaskPriorityFilterValue;
  recurrence?: TaskRecurrence;
  customRecurrence?: string;
  projectTag?: string;
  tags?: string[];
  notes?: string;
  relatedNote?: string;
  syncTarget?: TaskSyncTarget;
}

export interface TaskCalendarTaskEditContext {
  projectTagPrefix: string;
  appleSyncTag: string;
}

const DETAIL_RE = /<!--\s*memos-plus-task-detail:([^\s>]+)\s*-->/u;
const PRIORITY_RE = /(?:🔺|⏫|🔼|🔽|⏬)/gu;
const DATE_RE = /📅\s*\d{4}-\d{2}-\d{2}/gu;
const START_DATE_RE = /🛫\s*\d{4}-\d{2}-\d{2}/gu;
const TIME_RE = /⏰\s*\d{1,2}:\d{2}/gu;
const RECURRENCE_RE = /🔁\s*.*?(?=\s+(?:#|🔺|⏫|🔼|🔽|⏬|🛫|⏳|📅|⏰|➕|✅|<!--)|$)/gu;
const TAG_RE = /(^|\s)(#[^\s#]+)/gu;

const PRIORITY_MARKERS: Record<TaskPriorityFilterValue, string> = {
  highest: "🔺",
  high: "⏫",
  medium: "🔼",
  low: "🔽",
  lowest: "⏬",
  none: ""
};

export function taskCalendarTaskKey(task: Pick<TaskIndexItem, "filePath" | "lineNumber">): string {
  return `${task.filePath}\u0000${task.lineNumber}`;
}

export function parseTaskCalendarDetailMetadata(line: string): TaskCalendarDetailMetadata {
  const encoded = line.match(DETAIL_RE)?.[1];
  if (!encoded) return {};
  try {
    const value = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    return {
      notes: typeof value.notes === "string" ? value.notes : "",
      relatedNote: typeof value.relatedNote === "string" ? value.relatedNote : ""
    };
  } catch {
    return {};
  }
}

export function taskCalendarTaskTags(line: string, context: TaskCalendarTaskEditContext): string[] {
  const projectPrefix = normalizeTag(context.projectTagPrefix).toLocaleLowerCase();
  const syncTag = normalizeTag(context.appleSyncTag).toLocaleLowerCase();
  const tags: string[] = [];
  const visible = line.replace(/<!--[^>]*-->/gu, " ");
  for (const match of visible.matchAll(TAG_RE)) {
    const tag = normalizeTag(match[2]);
    const lower = tag.toLocaleLowerCase();
    if (!tag || lower === syncTag || (projectPrefix && lower.startsWith(`${projectPrefix}/`)) || tags.some((item) => item.toLocaleLowerCase() === lower)) continue;
    tags.push(tag);
  }
  return tags;
}

export function taskCalendarTaskProjectTag(line: string, projectTagPrefix: string): string {
  const prefix = normalizeTag(projectTagPrefix);
  if (!prefix) return "";
  const escaped = escapeRegExp(prefix.slice(1));
  return normalizeTag(line.match(new RegExp(`(^|\\s)(#${escaped}/[^\\s#]+)`, "iu"))?.[2] ?? "");
}

export function updateTaskCalendarTaskLine(
  task: Pick<TaskIndexItem, "line" | "title" | "syncTarget" | "appleSyncTagged">,
  patch: TaskCalendarTaskPatch,
  context: TaskCalendarTaskEditContext
): string {
  let line = task.line;
  const sourceMetadata = parseMemosPlusTaskMetadata(line);
  let target = task.syncTarget || (task.appleSyncTagged ? "reminders" : "");
  if (patch.syncTarget !== undefined) {
    const syncTag = normalizeTag(context.appleSyncTag);
    if (syncTag) line = removeExactTag(line, syncTag);
    line = stripMemosPlusTaskMetadata(line);
    target = patch.syncTarget === "tasks" ? "" : patch.syncTarget;
    if (target && syncTag) line = appendVisibleToken(line, syncTag);
    if (target === "calendar") line = line.replace(DATE_RE, (value) => value.replace("📅", "🛫"));
    if (target === "reminders") line = line.replace(START_DATE_RE, (value) => value.replace("🛫", "📅"));
  }
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title && task.title && line.includes(task.title)) line = line.replace(task.title, title);
  }

  if (patch.priority !== undefined) line = replaceVisibleToken(line, PRIORITY_RE, PRIORITY_MARKERS[patch.priority]);
  if (patch.recurrence !== undefined || patch.customRecurrence !== undefined) {
    const current = taskCalendarTaskRecurrence(line);
    const recurrence = patch.recurrence ?? current.recurrence;
    const custom = patch.customRecurrence ?? current.customRecurrence;
    const rule = recurrenceRule(recurrence, custom);
    line = replaceVisibleToken(line, RECURRENCE_RE, rule ? `🔁 ${rule}` : "");
  }
  if (patch.date !== undefined) {
    const marker = target === "calendar" ? "🛫" : "📅";
    const opposite = target === "calendar" ? DATE_RE : START_DATE_RE;
    line = replaceVisibleToken(line, opposite, "");
    line = replaceVisibleToken(line, target === "calendar" ? START_DATE_RE : DATE_RE, patch.date ? `${marker} ${patch.date}` : "");
  }
  if (patch.time !== undefined) line = replaceVisibleToken(line, TIME_RE, patch.time ? `⏰ ${patch.time}` : "");

  if (patch.projectTag !== undefined) {
    const currentProject = taskCalendarTaskProjectTag(line, context.projectTagPrefix);
    if (currentProject) line = removeExactTag(line, currentProject);
    const project = normalizeTag(patch.projectTag);
    if (project) line = appendVisibleToken(line, project);
  }
  if (patch.tags !== undefined) {
    for (const tag of taskCalendarTaskTags(line, context)) line = removeExactTag(line, tag);
    for (const tag of uniqueTags(patch.tags)) line = appendVisibleToken(line, tag);
  }

  const existingMetadata = parseMemosPlusTaskMetadata(line) ?? sourceMetadata;
  const recurrenceMetadata = patch.recurrence !== undefined || patch.customRecurrence !== undefined
    ? recurrenceMetadataValue(taskCalendarTaskRecurrence(line))
    : existingMetadata?.recurrence;
  const reminderMinutesBefore = patch.reminderMinutesBefore === null
    ? undefined
    : patch.reminderMinutesBefore ?? existingMetadata?.reminderMinutesBefore;
  const visibleTime = line.match(TIME_RE)?.[0]?.replace(/^⏰\s*/u, "") ?? "";
  if (target === "reminders") {
    line = attachMemosPlusTaskMetadata(line, {
      target: "reminders",
      dueTime: patch.time ?? existingMetadata?.dueTime ?? existingMetadata?.startTime ?? visibleTime,
      reminderDate: patch.reminderDate ?? existingMetadata?.reminderDate,
      reminderTime: patch.reminderTime ?? existingMetadata?.reminderTime,
      reminderMinutesBefore,
      allDay: patch.time === "" ? existingMetadata?.allDay : false,
      recurrence: recurrenceMetadata,
      completedAt: existingMetadata?.completedAt
    });
  } else if (target === "calendar") {
    line = attachMemosPlusTaskMetadata(line, {
      target: "calendar",
      startTime: patch.time ?? existingMetadata?.startTime ?? existingMetadata?.dueTime ?? visibleTime,
      endDate: existingMetadata?.endDate,
      endTime: existingMetadata?.endTime,
      reminderMinutesBefore,
      allDay: patch.time === "" ? existingMetadata?.allDay : false,
      recurrence: recurrenceMetadata,
      completedAt: existingMetadata?.completedAt
    });
  } else if (existingMetadata?.completedAt) {
    // Switching a completed task back to plain Tasks must not erase its real
    // completion timestamp along with the previous Apple timing metadata.
    line = attachMemosPlusTaskMetadata(line, {
      target: "tasks",
      completedAt: existingMetadata.completedAt
    });
  }

  if (patch.notes !== undefined || patch.relatedNote !== undefined) {
    const current = parseTaskCalendarDetailMetadata(line);
    line = stripTaskCalendarDetailMetadata(line);
    const detail = {
      notes: patch.notes ?? current.notes ?? "",
      relatedNote: patch.relatedNote ?? current.relatedNote ?? ""
    };
    if (detail.notes || detail.relatedNote) {
      line = `${line.trimEnd()} <!-- memos-plus-task-detail:${encodeURIComponent(JSON.stringify(detail))} -->`;
    }
  }
  return normalizeTaskLineSpacing(line);
}

export function taskCalendarTaskRecurrence(line: string): { recurrence: TaskRecurrence; customRecurrence: string } {
  const rule = line.match(RECURRENCE_RE)?.[0]?.replace(/^🔁\s*/u, "").trim() ?? "";
  const recurrence = normalizeTaskRecurrence(rule);
  return recurrence === "none" && rule
    ? { recurrence: "custom", customRecurrence: rule }
    : { recurrence, customRecurrence: recurrence === "custom" ? rule : "" };
}

export function taskCalendarTaskWithPatch(
  task: TaskIndexItem,
  patch: TaskCalendarTaskPatch,
  context: TaskCalendarTaskEditContext
): TaskIndexItem {
  const line = updateTaskCalendarTaskLine(task, patch, context);
  const parsed = parseTaskIndexItemsFromMarkdown(line, {
    filePath: task.filePath,
    fileName: task.fileName,
    mtime: task.mtime
  })[0];
  if (!parsed) return { ...task, line };
  return {
    ...task,
    ...parsed,
    filePath: task.filePath,
    fileName: task.fileName,
    lineNumber: task.lineNumber,
    mtime: task.mtime
  };
}

export function stripTaskCalendarDetailMetadata(line: string): string {
  return line.replace(DETAIL_RE, "").replace(/\s{2,}/gu, " ").trimEnd();
}

export function taskCalendarPostponeDate(kind: "today" | "tomorrow" | "next-week", now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (kind === "tomorrow") date.setDate(date.getDate() + 1);
  if (kind === "next-week") date.setDate(date.getDate() + (7 - ((date.getDay() + 6) % 7)));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function replaceVisibleToken(line: string, expression: RegExp, token: string): string {
  const without = line.replace(expression, " ");
  return token ? appendVisibleToken(without, token) : normalizeTaskLineSpacing(without);
}

function appendVisibleToken(line: string, token: string): string {
  const commentIndex = line.indexOf("<!--");
  if (commentIndex < 0) return normalizeTaskLineSpacing(`${line} ${token}`);
  const visible = line.slice(0, commentIndex).trimEnd();
  const comments = line.slice(commentIndex).trimStart();
  return normalizeTaskLineSpacing(`${visible} ${token} ${comments}`);
}

function removeExactTag(line: string, tag: string): string {
  const escaped = escapeRegExp(normalizeTag(tag));
  return normalizeTaskLineSpacing(line.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "giu"), " "));
}

function uniqueTags(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const tag = normalizeTag(value);
    if (tag && !result.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) result.push(tag);
  }
  return result;
}

function recurrenceRule(recurrence: TaskRecurrence, custom: string): string {
  if (recurrence === "daily") return "every day";
  if (recurrence === "weekdays") return "every weekday";
  if (recurrence === "weekly") return "every week";
  if (recurrence === "monthly") return "every month";
  if (recurrence === "yearly") return "every year";
  if (recurrence === "custom") return custom.trim().replace(/^🔁\s*/u, "");
  return "";
}

function recurrenceMetadataValue(value: ReturnType<typeof taskCalendarTaskRecurrence>): string {
  if (value.recurrence === "none") return "";
  return value.recurrence === "custom" ? value.customRecurrence : value.recurrence;
}

function normalizeTag(value: string): string {
  const clean = value.trim().replace(/^#+/u, "").replace(/[.,，。;；:：!?！？]+$/u, "").replace(/\s+/gu, "");
  return clean ? `#${clean}` : "";
}

function normalizeTaskLineSpacing(line: string): string {
  return line.replace(/\s+(?=<!--)/gu, " ").replace(/ {2,}/gu, " ").trimEnd();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
