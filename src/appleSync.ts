import type { TaskIndexItem } from "./taskIndex";
import { attachMemosPlusTaskMetadata, parseMemosPlusTaskMetadata, stripMemosPlusTaskMetadata } from "./tasksFormat";
import { completeTaskWithRecurrence } from "./taskLineActions";

export type AppleSyncTarget = "reminders" | "calendar";
export type AppleSyncConflictPolicy = "remote-wins" | "local-wins" | "newest";
export type AppleSyncDirection = "none" | "push" | "pull";

export interface AppleSyncRemoteItem {
  kind: AppleSyncTarget;
  id: string;
  localId: string;
  title: string;
  completed: boolean;
  dueDate: string;
  dueTime: string;
  reminderDate?: string;
  reminderTime?: string;
  reminderMinutesBefore?: number;
  allDay?: boolean;
  endDate?: string;
  endTime?: string;
  recurrence?: string;
  priority: number;
  modifiedAt: string;
  notes: string;
}

export interface AppleSyncRecord {
  localId: string;
  kind: AppleSyncTarget;
  remoteId: string;
  localSignature: string;
  remoteSignature: string;
  lastSyncedAt: string;
}

export interface AppleSyncState {
  records: Record<string, AppleSyncRecord>;
  lastSyncAt: string;
  lastError: string;
}

export const DEFAULT_APPLE_SYNC_STATE: AppleSyncState = {
  records: {},
  lastSyncAt: "",
  lastError: ""
};

const APPLE_SYNC_ID_RE = /<!--\s*memos-plus-apple-id:([a-zA-Z0-9_-]+)\s*-->/;
const TASK_DETAIL_RE = /<!--\s*memos-plus-task-detail:[^\s>]+\s*-->/gu;
const TASK_PREFIX_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)[^\]](\]\s+)/;
const TASK_METADATA_RE = /(?:🔺|⏫|🔼|🔽|⏬|📅\s*\d{4}-\d{2}-\d{2}|⏰\s*\d{1,2}:\d{2}|⏳\s*\d{4}-\d{2}-\d{2}|🛫\s*\d{4}-\d{2}-\d{2}|➕\s*\d{4}-\d{2}-\d{2}|✅\s*\d{4}-\d{2}-\d{2}|🔁|#[^\s#]+|<!--)/u;

export function normalizeAppleSyncTarget(value: unknown): AppleSyncTarget {
  return value === "calendar" ? "calendar" : "reminders";
}

export function normalizeAppleSyncConflictPolicy(value: unknown): AppleSyncConflictPolicy {
  if (value === "local-wins" || value === "remote-wins") {
    return value;
  }
  return "newest";
}

export function normalizeAppleSyncTag(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim().split(/\s+/)[0] : "";
  if (!trimmed) {
    return "#Apple同步";
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function normalizeAppleSyncInterval(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return [0, 5, 15, 30, 60].includes(parsed) ? parsed : 15;
}

export function normalizeAppleSyncState(value: unknown): AppleSyncState {
  if (!isRecord(value)) {
    return { ...DEFAULT_APPLE_SYNC_STATE, records: {} };
  }
  const records: Record<string, AppleSyncRecord> = {};
  if (isRecord(value.records)) {
    for (const [key, raw] of Object.entries(value.records)) {
      if (!isRecord(raw)) {
        continue;
      }
      const localId = text(raw.localId);
      const remoteId = text(raw.remoteId);
      if (!localId || !remoteId) {
        continue;
      }
      const kind = normalizeAppleSyncTarget(raw.kind);
      records[key] = {
        localId,
        kind,
        remoteId,
        localSignature: text(raw.localSignature),
        remoteSignature: text(raw.remoteSignature),
        lastSyncedAt: text(raw.lastSyncedAt)
      };
    }
  }
  return {
    records,
    lastSyncAt: text(value.lastSyncAt),
    lastError: text(value.lastError)
  };
}

export function appleSyncRecordKey(kind: AppleSyncTarget, localId: string): string {
  return `${kind}:${localId}`;
}

export function extractAppleSyncId(line: string): string {
  return line.match(APPLE_SYNC_ID_RE)?.[1] ?? "";
}

export function attachAppleSyncId(line: string, id: string): string {
  const clean = line.replace(APPLE_SYNC_ID_RE, "").trimEnd();
  return `${clean} <!-- memos-plus-apple-id:${id} -->`;
}

export function shouldSyncTask(task: Pick<TaskIndexItem, "line">, tag: string): boolean {
  const target = parseMemosPlusTaskMetadata(task.line)?.target;
  return target !== "calendar" && containsTag(task.line, normalizeAppleSyncTag(tag));
}

export function shouldSyncCalendarTask(task: Pick<TaskIndexItem, "line">): boolean {
  return parseMemosPlusTaskMetadata(task.line)?.target === "calendar";
}

export function taskTitleForApple(task: Pick<TaskIndexItem, "text">, tag: string): string {
  return task.text
    .replace(APPLE_SYNC_ID_RE, "")
    .replace(TASK_DETAIL_RE, "")
    .replace(/<!--\s*memos-plus-task-meta:[^\s>]+\s*-->/gu, "")
    .replace(new RegExp(`(^|\\s)${escapeRegExp(normalizeAppleSyncTag(tag))}(?=\\s|$)`, "gu"), " ")
    .replace(/(?:🔺|⏫|🔼|🔽|⏬)/gu, " ")
    .replace(/(?:📅|⏳|🛫|➕|✅)\s*\d{4}-\d{2}-\d{2}/gu, " ")
    .replace(/⏰\s*\d{1,2}:\d{2}/gu, " ")
    .replace(/🔁\s*[^#<]*/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function localAppleSyncSignature(task: TaskIndexItem, tag: string, kind: AppleSyncTarget): string {
  const metadata = parseMemosPlusTaskMetadata(task.line);
  const reminder = canonicalLocalReminder(task, metadata);
  return JSON.stringify({
    title: appleTitleForKind(taskTitleForApple(task, tag), task.completed, kind),
    completed: task.completed,
    dueDate: kind === "calendar" ? task.startDate || task.scheduledDate || task.dueDate || "" : task.dueDate || task.scheduledDate || "",
    dueTime: kind === "calendar" ? metadata?.startTime ?? "" : taskTimeForApple(task),
    reminderDate: kind === "reminders" ? reminder.date : "",
    reminderTime: kind === "reminders" ? reminder.time : "",
    reminderMinutesBefore: kind === "reminders" ? reminder.minutesBefore ?? null : metadata?.reminderMinutesBefore ?? null,
    allDay: metadata?.allDay === true,
    endDate: kind === "calendar" ? metadata?.endDate ?? "" : "",
    endTime: kind === "calendar" ? metadata?.endTime ?? "" : "",
    recurrence: kind === "calendar" ? metadata?.recurrence ?? "" : "",
    priority: kind === "calendar" ? 0 : taskPriorityToApple(task.priority)
  });
}

function canonicalLocalReminder(task: TaskIndexItem, metadata: ReturnType<typeof parseMemosPlusTaskMetadata>): { date: string; time: string; minutesBefore?: number } {
  const dueDate = task.dueDate || task.scheduledDate || "";
  const dueTime = taskTimeForApple(task);
  if (metadata?.reminderDate && metadata.reminderTime) {
    return {
      date: metadata.reminderDate,
      time: metadata.reminderTime,
      minutesBefore: minutesBetween(dueDate, dueTime, metadata.reminderDate, metadata.reminderTime)
    };
  }
  if (dueDate && dueTime && metadata?.reminderMinutesBefore !== undefined) {
    const due = localDateTime(dueDate, dueTime);
    due.setMinutes(due.getMinutes() - metadata.reminderMinutesBefore);
    return { date: localDateString(due), time: localTimeString(due), minutesBefore: metadata.reminderMinutesBefore };
  }
  return { date: "", time: "" };
}

function minutesBetween(dueDate: string, dueTime: string, reminderDate: string, reminderTime: string): number | undefined {
  if (!dueDate || !dueTime) return undefined;
  const difference = localDateTime(dueDate, dueTime).getTime() - localDateTime(reminderDate, reminderTime).getTime();
  return difference >= 0 ? Math.round(difference / 60_000) : undefined;
}

function localDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function localDateString(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function localTimeString(date: Date): string {
  return [String(date.getHours()).padStart(2, "0"), String(date.getMinutes()).padStart(2, "0")].join(":");
}

export function remoteAppleSyncSignature(item: AppleSyncRemoteItem): string {
  return JSON.stringify({
    title: item.title.trim(),
    completed: item.completed,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    reminderDate: item.kind === "reminders" ? item.reminderDate ?? "" : "",
    reminderTime: item.kind === "reminders" ? item.reminderTime ?? "" : "",
    reminderMinutesBefore: item.reminderMinutesBefore ?? null,
    allDay: item.allDay === true,
    endDate: item.kind === "calendar" ? item.endDate ?? "" : "",
    endTime: item.kind === "calendar" ? item.endTime ?? "" : "",
    recurrence: item.kind === "calendar" ? item.recurrence ?? "" : "",
    priority: item.priority
  });
}

export function resolveAppleSyncDirection(
  localSignature: string,
  remoteSignature: string,
  record: AppleSyncRecord | undefined,
  policy: AppleSyncConflictPolicy,
  localModifiedAt: number,
  remoteModifiedAt: string
): AppleSyncDirection {
  if (!record) {
    if (localSignature === remoteSignature) {
      return "none";
    }
    return policy === "local-wins" ? "push" : policy === "newest" && localModifiedAt > dateMs(remoteModifiedAt) ? "push" : "pull";
  }
  const localChanged = localSignature !== record.localSignature;
  const remoteChanged = remoteSignature !== record.remoteSignature;
  if (!localChanged && !remoteChanged) {
    return "none";
  }
  if (localChanged && !remoteChanged) {
    return "push";
  }
  if (!localChanged && remoteChanged) {
    return "pull";
  }
  if (policy === "local-wins") {
    return "push";
  }
  if (policy === "remote-wins") {
    return "pull";
  }
  return localModifiedAt > dateMs(remoteModifiedAt) ? "push" : "pull";
}

export function updateTaskLineFromApple(line: string, item: AppleSyncRemoteItem, tag: string, localId: string): string {
  const prefix = line.match(TASK_PREFIX_RE);
  if (!prefix) {
    return line;
  }
  const originalMetadata = parseMemosPlusTaskMetadata(line);
  const content = stripMemosPlusTaskMetadata(line).replace(TASK_PREFIX_RE, "");
  const metadataIndex = content.search(TASK_METADATA_RE);
  const suffix = metadataIndex >= 0 ? content.slice(metadataIndex) : "";
  const preserved = suffix
    .replace(APPLE_SYNC_ID_RE, " ")
    .replace(new RegExp(`(^|\\s)${escapeRegExp(normalizeAppleSyncTag(tag))}(?=\\s|$)`, "gu"), " ")
    .replace(/(?:🔺|⏫|🔼|🔽|⏬)/gu, " ")
    .replace(/📅\s*\d{4}-\d{2}-\d{2}/gu, " ")
    .replace(/⏰\s*\d{1,2}:\d{2}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = normalizeRemoteTitle(item.title, item.kind);
  const parts = [title];
  const priority = applePriorityMarker(item.priority);
  if (priority) {
    parts.push(priority);
  }
  if (item.dueDate) {
    parts.push(`📅 ${item.dueDate}`);
    if (item.dueTime) {
      parts.push(`⏰ ${item.dueTime}`);
    }
  }
  if (preserved) {
    parts.push(preserved);
  }
  parts.push(normalizeAppleSyncTag(tag), `<!-- memos-plus-apple-id:${localId} -->`);
  const updated = `${prefix[1]}${item.completed ? "x" : " "}${prefix[2]}${parts.join(" ")}`;
  const withMetadata = attachMemosPlusTaskMetadata(updated, {
    target: "reminders",
    dueTime: item.dueTime,
    reminderDate: item.reminderDate,
    reminderTime: item.reminderTime,
    reminderMinutesBefore: originalMetadata?.reminderMinutesBefore,
    allDay: item.allDay,
    recurrence: originalMetadata?.recurrence
  });
  const wasIncomplete = /^\s*(?:[-*+]|\d+[.)])\s+\[\s\]/u.test(line);
  return item.completed && wasIncomplete && withMetadata.includes("🔁")
    ? completeTaskWithRecurrence(withMetadata)
    : withMetadata;
}

export function formatImportedAppleTask(item: AppleSyncRemoteItem, tag: string, localId: string): string {
  const title = normalizeRemoteTitle(item.title, item.kind) || "Apple";
  const parts = [`- [${item.completed ? "x" : " "}] ${title}`];
  const priority = applePriorityMarker(item.priority);
  if (priority) {
    parts.push(priority);
  }
  if (item.dueDate) {
    parts.push(`📅 ${item.dueDate}`);
    if (item.dueTime) {
      parts.push(`⏰ ${item.dueTime}`);
    }
  }
  parts.push(normalizeAppleSyncTag(tag), `<!-- memos-plus-apple-id:${localId} -->`);
  return attachMemosPlusTaskMetadata(parts.join(" "), {
    target: "reminders",
    dueTime: item.dueTime,
    reminderDate: item.reminderDate,
    reminderTime: item.reminderTime,
    allDay: item.allDay
  });
}

export function appleTitleForKind(title: string, completed: boolean, kind: AppleSyncTarget): string {
  const clean = normalizeRemoteTitle(title, kind);
  return kind === "calendar" && completed ? `✓ ${clean}` : clean;
}

export function taskPriorityToApple(priority: TaskIndexItem["priority"]): number {
  if (priority === "highest" || priority === "high") {
    return 1;
  }
  if (priority === "medium") {
    return 5;
  }
  if (priority === "low" || priority === "lowest") {
    return 9;
  }
  return 0;
}

export function taskTimeForApple(task: Pick<TaskIndexItem, "line">): string {
  const metadataTime = parseMemosPlusTaskMetadata(task.line)?.dueTime;
  if (metadataTime) return metadataTime;
  const match = task.line.match(/⏰\s*(\d{1,2}):(\d{2})/u);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function taskReminderForApple(task: Pick<TaskIndexItem, "line">): {
  reminderDate: string;
  reminderTime: string;
  reminderMinutesBefore?: number;
  allDay: boolean;
} {
  const metadata = parseMemosPlusTaskMetadata(task.line);
  return {
    reminderDate: metadata?.reminderDate ?? "",
    reminderTime: metadata?.reminderTime ?? "",
    reminderMinutesBefore: metadata?.reminderMinutesBefore,
    allDay: metadata?.allDay === true
  };
}

function normalizeRemoteTitle(title: string, kind: AppleSyncTarget): string {
  const clean = title.trim();
  return kind === "calendar" ? clean.replace(/^✓\s*/u, "").trim() : clean;
}

function applePriorityMarker(priority: number): string {
  if (priority > 0 && priority <= 4) {
    return "⏫";
  }
  if (priority >= 5 && priority <= 8) {
    return "🔼";
  }
  return priority >= 9 ? "🔽" : "";
}

function containsTag(line: string, tag: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=\\s|$)`, "u").test(line);
}

function dateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
