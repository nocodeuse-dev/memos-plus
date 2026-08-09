import type { TaskIndexItem } from "./taskIndex";

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
  return containsTag(task.line, normalizeAppleSyncTag(tag));
}

export function taskTitleForApple(task: Pick<TaskIndexItem, "text">, tag: string): string {
  return task.text
    .replace(APPLE_SYNC_ID_RE, "")
    .replace(new RegExp(`(^|\\s)${escapeRegExp(normalizeAppleSyncTag(tag))}(?=\\s|$)`, "gu"), " ")
    .replace(/(?:🔺|⏫|🔼|🔽|⏬)/gu, " ")
    .replace(/(?:📅|⏳|🛫|➕|✅)\s*\d{4}-\d{2}-\d{2}/gu, " ")
    .replace(/⏰\s*\d{1,2}:\d{2}/gu, " ")
    .replace(/🔁\s*[^#<]*/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function localAppleSyncSignature(task: TaskIndexItem, tag: string, kind: AppleSyncTarget): string {
  return JSON.stringify({
    title: appleTitleForKind(taskTitleForApple(task, tag), task.completed, kind),
    completed: task.completed,
    dueDate: task.dueDate || task.scheduledDate || "",
    dueTime: taskTimeForApple(task),
    priority: taskPriorityToApple(task.priority)
  });
}

export function remoteAppleSyncSignature(item: AppleSyncRemoteItem): string {
  return JSON.stringify({
    title: item.title.trim(),
    completed: item.completed,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
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
  const content = line.replace(TASK_PREFIX_RE, "");
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
  return `${prefix[1]}${item.completed ? "x" : " "}${prefix[2]}${parts.join(" ")}`;
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
  return parts.join(" ");
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
  const match = task.line.match(/⏰\s*(\d{1,2}):(\d{2})/u);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
