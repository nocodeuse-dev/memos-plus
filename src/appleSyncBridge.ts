import type { AppleSyncRemoteItem, AppleSyncTarget } from "./appleSync";

export interface AppleSyncProbeResult {
  reminderLists: string[];
  calendars: Array<{ name: string; writable: boolean }>;
  defaultReminderList: string;
}

export interface AppleSyncContainerResult {
  name: string;
  writable: boolean;
}

export interface AppleSyncUpsertInput {
  kind: AppleSyncTarget;
  container: string;
  remoteId?: string;
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
}

export interface AppleSyncBridge {
  probe(kind: AppleSyncTarget): Promise<AppleSyncProbeResult>;
  createContainer(kind: AppleSyncTarget, name: string): Promise<AppleSyncContainerResult>;
  list(kind: AppleSyncTarget, container: string): Promise<AppleSyncRemoteItem[]>;
  upsert(input: AppleSyncUpsertInput): Promise<AppleSyncRemoteItem>;
  remove(kind: AppleSyncTarget, container: string, remoteId: string, localId?: string): Promise<boolean>;
}

interface JxaRequest {
  operation: "probe" | "create-container" | "list" | "upsert" | "remove";
  kind?: AppleSyncTarget;
  container?: string;
  remoteId?: string;
  localId?: string;
  title?: string;
  completed?: boolean;
  dueDate?: string;
  dueTime?: string;
  reminderDate?: string;
  reminderTime?: string;
  reminderMinutesBefore?: number;
  allDay?: boolean;
  endDate?: string;
  endTime?: string;
  recurrence?: string;
  priority?: number;
}

const APPLE_SYNC_JXA = String.raw`
function run(argv) {
  const request = JSON.parse(argv[0] || "{}");
  if (request.operation === "probe") return JSON.stringify(probe(request.kind));
  if (request.operation === "create-container") return JSON.stringify(createContainer(request));
  if (request.operation === "list") return JSON.stringify(listItems(request));
  if (request.operation === "upsert") return JSON.stringify(upsertItem(request));
  if (request.operation === "remove") return JSON.stringify(removeItem(request));
  throw new Error("Unsupported Memos Plus Apple sync operation");
}

function probe(kind) {
  if (kind === "calendar") {
    const calendar = Application("Calendar");
    return {
      reminderLists: [],
      calendars: calendar.calendars().map(function (item) {
        let writable = false;
        try { writable = Boolean(item.writable()); } catch (_) {}
        return { name: String(item.name()), writable: writable };
      }),
      defaultReminderList: ""
    };
  }
  const reminders = Application("Reminders");
  let defaultReminderList = "";
  try { defaultReminderList = String(reminders.defaultList().name()); } catch (_) {}
  return {
    reminderLists: reminders.lists().map(function (item) { return String(item.name()); }),
    calendars: [],
    defaultReminderList: defaultReminderList
  };
}

function createContainer(request) {
  const name = String(request.container || "").trim();
  if (!name) throw new Error("Apple sync container name is empty");
  if (request.kind === "calendar") {
    const app = Application("Calendar");
    const existing = app.calendars.whose({ name: name })();
    if (existing.length > 0) {
      let writable = false;
      try { writable = Boolean(existing[0].writable()); } catch (_) {}
      if (!writable) throw new Error("Calendar is read-only: " + name);
      return { name: String(existing[0].name()), writable: true };
    }
    const created = app.Calendar({ name: name });
    app.calendars.push(created);
    let writable = false;
    try { writable = Boolean(created.writable()); } catch (_) {}
    if (!writable) throw new Error("Calendar was created but is not writable: " + name);
    return { name: String(created.name()), writable: true };
  }
  const app = Application("Reminders");
  const existing = app.lists.whose({ name: name })();
  if (existing.length > 0) return { name: String(existing[0].name()), writable: true };
  const created = app.List({ name: name });
  app.lists.push(created);
  return { name: String(created.name()), writable: true };
}

function listItems(request) {
  return request.kind === "calendar" ? listCalendarItems(request.container) : listReminderItems(request.container);
}

function listReminderItems(containerName) {
  const app = Application("Reminders");
  const list = requiredCollection(app.lists.whose({ name: String(containerName || "") })(), "Reminders list", containerName);
  const reminders = list.reminders;
  const ids = safeArray(function () { return reminders.id(); });
  const names = safeArray(function () { return reminders.name(); });
  const bodies = safeArray(function () { return reminders.body(); });
  const completed = safeArray(function () { return reminders.completed(); });
  const completionDates = safeArray(function () { return reminders.completionDate(); });
  const priorities = safeArray(function () { return reminders.priority(); });
  const dueDates = safeArray(function () { return reminders.dueDate(); });
  const allDayDueDates = safeArray(function () { return reminders.alldayDueDate(); });
  const remindDates = safeArray(function () { return reminders.remindMeDate(); });
  const modifiedDates = safeArray(function () { return reminders.modificationDate(); });
  return ids.map(function (id, index) {
    return reminderRecordFromValues({
      id: id,
      name: names[index],
      body: bodies[index],
      completed: completed[index],
      completionDate: completionDates[index],
      priority: priorities[index],
      dueDate: dueDates[index],
      allDayDueDate: allDayDueDates[index],
      remindMeDate: remindDates[index],
      modificationDate: modifiedDates[index]
    }, list.name());
  });
}

function listCalendarItems(containerName) {
  const app = Application("Calendar");
  const calendar = requiredCollection(app.calendars.whose({ name: String(containerName || "") })(), "Calendar", containerName);
  return calendar.events().map(function (item) { return calendarRecord(item, calendar.name()); });
}

function upsertItem(request) {
  return request.kind === "calendar" ? upsertCalendarItem(request) : upsertReminderItem(request);
}

function removeItem(request) {
  if (request.kind !== "reminders") throw new Error("Memos Plus deletes tasks only from Apple Reminders");
  const app = Application("Reminders");
  const list = requiredCollection(app.lists.whose({ name: String(request.container || "") })(), "Reminders list", request.container);
  let reminder = null;
  const matches = list.reminders.whose({ id: String(request.remoteId || "") })();
  if (matches.length > 0) reminder = matches[0];
  if (!reminder && request.localId) reminder = reminderByLocalId(list, request.localId);
  if (!reminder) return false;
  app.delete(reminder);
  return true;
}

function upsertReminderItem(request) {
  const app = Application("Reminders");
  const list = requiredCollection(app.lists.whose({ name: String(request.container || "") })(), "Reminders list", request.container);
  let reminder = null;
  if (request.remoteId) {
    const matches = list.reminders.whose({ id: String(request.remoteId) })();
    if (matches.length > 0) reminder = matches[0];
  }
  if (!reminder && request.localId) reminder = reminderByLocalId(list, request.localId);
  if (!reminder) {
    reminder = app.Reminder({ name: String(request.title || ""), completed: Boolean(request.completed) });
    list.reminders.push(reminder);
  }
  reminder.name = String(request.title || "");
  reminder.completed = Boolean(request.completed);
  reminder.priority = Number(request.priority || 0);
  reminder.body = withLocalMarker(safeGet(function () { return reminder.body(); }), request.localId);
  if (request.dueDate) {
    reminder.alldayDueDate = localDate(request.dueDate);
    if (!request.allDay && request.dueTime) reminder.dueDate = localDateTime(request.dueDate, request.dueTime);
    else {
      try { reminder.dueDate = null; } catch (_) {}
    }
  } else {
    try { reminder.dueDate = null; } catch (_) {}
    try { reminder.alldayDueDate = null; } catch (_) {}
  }
  const remindDate = reminderAlertDate(request);
  try { reminder.remindMeDate = remindDate; } catch (_) {}
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
  const allDay = Boolean(request.allDay);
  const start = allDay || !request.dueTime ? localDateAtMidnight(request.dueDate) : localDateTime(request.dueDate, request.dueTime);
  const endDate = String(request.endDate || request.dueDate);
  const end = allDay
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0)
    : localDateTime(endDate, request.endTime || request.dueTime);
  if (end <= start) throw new Error("Calendar event end time must be after start time");
  if (!event) {
    event = app.Event({
      summary: String(request.title || ""),
      startDate: start,
      endDate: end,
      alldayEvent: allDay,
      description: withLocalMarker("", request.localId)
    });
    calendar.events.push(event);
  } else {
    event.summary = String(request.title || "");
    event.startDate = start;
    event.endDate = end;
    event.alldayEvent = allDay;
    event.description = withLocalMarker(safeGet(function () { return event.description(); }), request.localId);
  }
  const recurrence = calendarRecurrence(request.recurrence);
  try { event.recurrence = recurrence; } catch (_) {}
  replaceDisplayAlarm(app, event, request.reminderMinutesBefore);
  return calendarRecord(event, calendar.name());
}

function reminderRecord(item, containerName) {
  const due = safeDate(function () { return item.dueDate(); });
  const allDayDue = safeDate(function () { return item.alldayDueDate(); });
  const remind = safeDate(function () { return item.remindMeDate(); });
  const completion = safeDate(function () { return item.completionDate(); });
  return {
    kind: "reminders",
    id: String(item.id()),
    localId: localIdFromNotes(safeGet(function () { return item.body(); })),
    title: safeGet(function () { return item.name(); }),
    completed: Boolean(item.completed()),
    completionDate: completion ? localDateString(completion) : "",
    dueDate: allDayDue ? localDateString(allDayDue) : (due ? localDateString(due) : ""),
    dueTime: due ? localTimeString(due) : "",
    reminderDate: remind ? localDateString(remind) : "",
    reminderTime: remind ? localTimeString(remind) : "",
    reminderMinutesBefore: due && remind ? Math.max(0, Math.round((due.getTime() - remind.getTime()) / 60000)) : undefined,
    allDay: Boolean(allDayDue && !due),
    priority: Number(item.priority() || 0),
    modifiedAt: safeIso(function () { return item.modificationDate(); }),
    notes: safeGet(function () { return item.body(); }),
    container: String(containerName || "")
  };
}

function reminderRecordFromValues(values, containerName) {
  const due = dateOrNull(values.dueDate);
  const allDayDue = dateOrNull(values.allDayDueDate);
  const remind = dateOrNull(values.remindMeDate);
  const completion = dateOrNull(values.completionDate);
  const modified = dateOrNull(values.modificationDate);
  const body = values.body == null ? "" : String(values.body);
  return {
    kind: "reminders",
    id: String(values.id || ""),
    localId: localIdFromNotes(body),
    title: values.name == null ? "" : String(values.name),
    completed: Boolean(values.completed),
    completionDate: completion ? localDateString(completion) : "",
    dueDate: allDayDue ? localDateString(allDayDue) : (due ? localDateString(due) : ""),
    dueTime: due ? localTimeString(due) : "",
    reminderDate: remind ? localDateString(remind) : "",
    reminderTime: remind ? localTimeString(remind) : "",
    reminderMinutesBefore: due && remind ? Math.max(0, Math.round((due.getTime() - remind.getTime()) / 60000)) : undefined,
    allDay: Boolean(allDayDue && !due),
    priority: Number(values.priority || 0),
    modifiedAt: modified ? modified.toISOString() : "",
    notes: body,
    container: String(containerName || "")
  };
}

function reminderByLocalId(list, localId) {
  const reminders = list.reminders;
  const bodies = safeArray(function () { return reminders.body(); });
  const index = bodies.findIndex(function (body) { return localIdFromNotes(body) === String(localId || ""); });
  return index >= 0 ? reminders[index] : null;
}

function calendarRecord(item, containerName) {
  const start = safeDate(function () { return item.startDate(); });
  const end = safeDate(function () { return item.endDate(); });
  const title = safeGet(function () { return item.summary(); });
  return {
    kind: "calendar",
    id: String(item.uid()),
    localId: localIdFromNotes(safeGet(function () { return item.description(); })),
    title: title,
    completed: /^✓\s*/.test(title),
    dueDate: start ? localDateString(start) : "",
    dueTime: start && !Boolean(safeValue(function () { return item.alldayEvent(); })) ? localTimeString(start) : "",
    endDate: end ? localDateString(end) : "",
    endTime: end ? localTimeString(end) : "",
    allDay: Boolean(safeValue(function () { return item.alldayEvent(); })),
    recurrence: safeGet(function () { return item.recurrence(); }),
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

function safeValue(getter) {
  try { return getter(); } catch (_) { return null; }
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

function safeArray(getter) {
  try {
    const value = getter();
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
}

function dateOrNull(value) {
  try { return value ? new Date(value) : null; } catch (_) { return null; }
}

function localDate(value) {
  const parts = String(value).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0, 0);
}

function localDateAtMidnight(value) {
  const parts = String(value).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

function reminderAlertDate(request) {
  if (request.reminderDate && request.reminderTime) return localDateTime(request.reminderDate, request.reminderTime);
  const minutes = Number(request.reminderMinutesBefore);
  if (request.dueDate && request.dueTime && Number.isFinite(minutes) && minutes >= 0) {
    return new Date(localDateTime(request.dueDate, request.dueTime).getTime() - minutes * 60000);
  }
  return null;
}

function replaceDisplayAlarm(app, event, minutesBefore) {
  const minutes = Number(minutesBefore);
  if (!Number.isFinite(minutes) || minutes < 0) return;
  try {
    event.displayAlarms().forEach(function (alarm) { app.delete(alarm); });
    event.displayAlarms.push(app.DisplayAlarm({ triggerInterval: -Math.round(minutes) }));
  } catch (_) {}
}

function calendarRecurrence(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "daily") return "FREQ=DAILY";
  if (normalized === "weekly") return "FREQ=WEEKLY";
  if (normalized === "monthly") return "FREQ=MONTHLY";
  if (normalized === "yearly") return "FREQ=YEARLY";
  return "";
}

function localDateTime(dateValue, timeValue) {
  const date = String(dateValue).split("-").map(Number);
  const time = String(timeValue || "").split(":").map(Number);
  return new Date(date[0], date[1] - 1, date[2], time[0] || 0, time[1] || 0, 0, 0);
}

function localDateString(value) {
  return [value.getFullYear(), pad(value.getMonth() + 1), pad(value.getDate())].join("-");
}

function localTimeString(value) {
  return [pad(value.getHours()), pad(value.getMinutes())].join(":");
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
  async probe(kind: AppleSyncTarget): Promise<AppleSyncProbeResult> {
    return this.run<AppleSyncProbeResult>({ operation: "probe", kind });
  }

  async createContainer(kind: AppleSyncTarget, name: string): Promise<AppleSyncContainerResult> {
    return this.run<AppleSyncContainerResult>({ operation: "create-container", kind, container: name });
  }

  async list(kind: AppleSyncTarget, container: string): Promise<AppleSyncRemoteItem[]> {
    return this.run<AppleSyncRemoteItem[]>({ operation: "list", kind, container });
  }

  async upsert(input: AppleSyncUpsertInput): Promise<AppleSyncRemoteItem> {
    const item = await this.run<AppleSyncRemoteItem>({ operation: "upsert", ...input });
    return { ...item, reminderMinutesBefore: input.reminderMinutesBefore };
  }

  async remove(kind: AppleSyncTarget, container: string, remoteId: string, localId?: string): Promise<boolean> {
    return this.run<boolean>({ operation: "remove", kind, container, remoteId, localId });
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
        { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const timedOut = error.killed || error.signal === "SIGTERM";
            reject(new Error(timedOut ? "Apple 提醒事项仍在等待 iCloud 返回，请稍后自动重试。" : normalizeAppleBridgeError(stderr || error.message)));
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
  if (/timed out|timeout|ETIMEDOUT/i.test(clean)) {
    return "Apple 提醒事项仍在等待 iCloud 返回，请稍后自动重试。";
  }
  return clean.slice(0, 500) || "Apple sync failed";
}
