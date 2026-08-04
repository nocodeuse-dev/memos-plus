import type { AppleSyncRemoteItem, AppleSyncTarget } from "./appleSync";

export interface AppleSyncProbeResult {
  reminderLists: string[];
  calendars: Array<{ name: string; writable: boolean }>;
}

export interface AppleSyncUpsertInput {
  kind: AppleSyncTarget;
  container: string;
  remoteId?: string;
  localId: string;
  title: string;
  completed: boolean;
  dueDate: string;
  priority: number;
}

export interface AppleSyncBridge {
  probe(): Promise<AppleSyncProbeResult>;
  list(kind: AppleSyncTarget, container: string): Promise<AppleSyncRemoteItem[]>;
  upsert(input: AppleSyncUpsertInput): Promise<AppleSyncRemoteItem>;
}

interface JxaRequest {
  operation: "probe" | "list" | "upsert";
  kind?: AppleSyncTarget;
  container?: string;
  remoteId?: string;
  localId?: string;
  title?: string;
  completed?: boolean;
  dueDate?: string;
  priority?: number;
}

const APPLE_SYNC_JXA = String.raw`
function run(argv) {
  const request = JSON.parse(argv[0] || "{}");
  if (request.operation === "probe") return JSON.stringify(probe());
  if (request.operation === "list") return JSON.stringify(listItems(request));
  if (request.operation === "upsert") return JSON.stringify(upsertItem(request));
  throw new Error("Unsupported Memos Plus Apple sync operation");
}

function probe() {
  const reminders = Application("Reminders");
  const calendar = Application("Calendar");
  return {
    reminderLists: reminders.lists().map(function (item) { return String(item.name()); }),
    calendars: calendar.calendars().map(function (item) {
      let writable = false;
      try { writable = Boolean(item.writable()); } catch (_) {}
      return { name: String(item.name()), writable: writable };
    })
  };
}

function listItems(request) {
  return request.kind === "calendar" ? listCalendarItems(request.container) : listReminderItems(request.container);
}

function listReminderItems(containerName) {
  const app = Application("Reminders");
  const list = requiredCollection(app.lists.whose({ name: String(containerName || "") })(), "Reminders list", containerName);
  return list.reminders().map(function (item) { return reminderRecord(item, list.name()); });
}

function listCalendarItems(containerName) {
  const app = Application("Calendar");
  const calendar = requiredCollection(app.calendars.whose({ name: String(containerName || "") })(), "Calendar", containerName);
  return calendar.events().map(function (item) { return calendarRecord(item, calendar.name()); });
}

function upsertItem(request) {
  return request.kind === "calendar" ? upsertCalendarItem(request) : upsertReminderItem(request);
}

function upsertReminderItem(request) {
  const app = Application("Reminders");
  const list = requiredCollection(app.lists.whose({ name: String(request.container || "") })(), "Reminders list", request.container);
  let reminder = null;
  if (request.remoteId) {
    const matches = list.reminders.whose({ id: String(request.remoteId) })();
    if (matches.length > 0) reminder = matches[0];
  }
  if (!reminder) {
    reminder = app.Reminder({ name: String(request.title || ""), completed: Boolean(request.completed) });
    list.reminders.push(reminder);
  }
  reminder.name = String(request.title || "");
  reminder.completed = Boolean(request.completed);
  reminder.priority = Number(request.priority || 0);
  reminder.body = withLocalMarker(safeGet(function () { return reminder.body(); }), request.localId);
  if (request.dueDate) {
    reminder.dueDate = localDate(request.dueDate);
  } else {
    try { reminder.dueDate = null; } catch (_) {}
  }
  return reminderRecord(reminder, list.name());
}

function upsertCalendarItem(request) {
  if (!request.dueDate) throw new Error("Calendar sync requires a due date");
  const app = Application("Calendar");
  const calendar = requiredCollection(app.calendars.whose({ name: String(request.container || "") })(), "Calendar", request.container);
  let writable = false;
  try { writable = Boolean(calendar.writable()); } catch (_) {}
  if (!writable) throw new Error("Calendar is read-only: " + request.container);
  let event = null;
  if (request.remoteId) {
    const matches = calendar.events.whose({ uid: String(request.remoteId) })();
    if (matches.length > 0) event = matches[0];
  }
  const start = localDate(request.dueDate);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  if (!event) {
    event = app.Event({
      summary: String(request.title || ""),
      startDate: start,
      endDate: end,
      alldayEvent: true,
      description: withLocalMarker("", request.localId)
    });
    calendar.events.push(event);
  } else {
    event.summary = String(request.title || "");
    event.startDate = start;
    event.endDate = end;
    event.alldayEvent = true;
    event.description = withLocalMarker(safeGet(function () { return event.description(); }), request.localId);
  }
  return calendarRecord(event, calendar.name());
}

function reminderRecord(item, containerName) {
  const due = safeDate(function () { return item.dueDate(); });
  return {
    kind: "reminders",
    id: String(item.id()),
    localId: localIdFromNotes(safeGet(function () { return item.body(); })),
    title: safeGet(function () { return item.name(); }),
    completed: Boolean(item.completed()),
    dueDate: due ? localDateString(due) : "",
    priority: Number(item.priority() || 0),
    modifiedAt: safeIso(function () { return item.modificationDate(); }),
    notes: safeGet(function () { return item.body(); }),
    container: String(containerName || "")
  };
}

function calendarRecord(item, containerName) {
  const start = safeDate(function () { return item.startDate(); });
  const title = safeGet(function () { return item.summary(); });
  return {
    kind: "calendar",
    id: String(item.uid()),
    localId: localIdFromNotes(safeGet(function () { return item.description(); })),
    title: title,
    completed: /^✓\s*/.test(title),
    dueDate: start ? localDateString(start) : "",
    priority: 0,
    modifiedAt: safeIso(function () { return item.stampDate(); }),
    notes: safeGet(function () { return item.description(); }),
    container: String(containerName || "")
  };
}

function requiredCollection(items, type, name) {
  if (!items || items.length === 0) throw new Error(type + " not found: " + String(name || ""));
  return items[0];
}

function safeGet(getter) {
  try {
    const value = getter();
    return value == null ? "" : String(value);
  } catch (_) { return ""; }
}

function safeDate(getter) {
  try {
    const value = getter();
    return value ? new Date(value) : null;
  } catch (_) { return null; }
}

function safeIso(getter) {
  const value = safeDate(getter);
  try { return value ? value.toISOString() : ""; } catch (_) { return ""; }
}

function localDate(value) {
  const parts = String(value).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0, 0);
}

function localDateString(value) {
  return [value.getFullYear(), pad(value.getMonth() + 1), pad(value.getDate())].join("-");
}

function pad(value) { return String(value).padStart(2, "0"); }

function localIdFromNotes(notes) {
  const match = String(notes || "").match(/(?:^|\n)memos-plus-id:([a-zA-Z0-9_-]+)(?:\n|$)/);
  return match ? match[1] : "";
}

function withLocalMarker(notes, localId) {
  const clean = String(notes || "")
    .replace(/(?:^|\n)memos-plus-id:[a-zA-Z0-9_-]+(?=\n|$)/g, "")
    .trim();
  const marker = "memos-plus-id:" + String(localId || "");
  return clean ? clean + "\n\n" + marker : marker;
}
`;

export class MacOsAppleSyncBridge implements AppleSyncBridge {
  async probe(): Promise<AppleSyncProbeResult> {
    return this.run<AppleSyncProbeResult>({ operation: "probe" });
  }

  async list(kind: AppleSyncTarget, container: string): Promise<AppleSyncRemoteItem[]> {
    return this.run<AppleSyncRemoteItem[]>({ operation: "list", kind, container });
  }

  async upsert(input: AppleSyncUpsertInput): Promise<AppleSyncRemoteItem> {
    return this.run<AppleSyncRemoteItem>({ operation: "upsert", ...input });
  }

  private async run<T>(request: JxaRequest): Promise<T> {
    if (!isMacOsDesktopRuntime()) {
      throw new Error("Apple sync is available only in Obsidian Desktop on macOS");
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Obsidian app:// cannot resolve dynamic Node imports; the runtime guard prevents mobile execution.
    const { execFile } = require("node:child_process") as typeof import("node:child_process");
    return new Promise<T>((resolve, reject) => {
      execFile(
        "/usr/bin/osascript",
        ["-l", "JavaScript", "-e", APPLE_SYNC_JXA, JSON.stringify(request)],
        { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(normalizeAppleBridgeError(stderr || error.message)));
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()) as T);
          } catch {
            reject(new Error("Apple sync returned an invalid response"));
          }
        }
      );
    });
  }
}

export function isMacOsDesktopRuntime(): boolean {
  return typeof process !== "undefined" && process.platform === "darwin" && typeof process.versions?.electron === "string";
}

export function normalizeAppleBridgeError(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (/not authorized|not permitted|permission|(-1743)|(-10004)/i.test(clean)) {
    return "Obsidian 没有访问 Apple 日历或提醒事项的权限，请在 macOS 系统设置 > 隐私与安全性中授权。";
  }
  return clean.slice(0, 500) || "Apple sync failed";
}
