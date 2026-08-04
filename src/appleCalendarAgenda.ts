import { isMacOsDesktopRuntime } from "./appleSyncBridge";

export interface AppleCalendarAgendaEvent {
  id: string;
  calendar: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  notes: string;
  recurring: boolean;
}

export interface AppleCalendarAgendaResult {
  events: AppleCalendarAgendaEvent[];
  calendars: Array<{ name: string; writable: boolean }>;
  fetchedAt: string;
}

export interface CreateAppleCalendarEventInput {
  calendar: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
}

const APPLE_CALENDAR_AGENDA_JXA = String.raw`
function run(argv) {
  const request = JSON.parse(argv[0] || "{}");
  if (request.operation === "create") return JSON.stringify(createEvent(request));
  const start = new Date(String(request.startDate) + "T00:00:00");
  const end = new Date(String(request.endDate) + "T00:00:00");
  const names = Array.isArray(request.calendarNames) ? request.calendarNames.map(String) : [];
  const app = Application("Calendar");
  const allCalendars = app.calendars();
  const calendars = allCalendars.filter(function (calendar) {
    const name = String(calendar.name());
    return names.length > 0 ? names.indexOf(name) >= 0 : !request.excludeGeneratedCalendars || !generatedCalendar(name);
  });
  const events = [];
  calendars.forEach(function (calendar) {
    // Query Calendar.app by the actual overlap window before asking for item
    // fields. Calling calendar.events() first forces Calendar to hydrate its
    // whole history, and a lower-bound-only query still returns every future
    // event. The two bounds preserve multi-day events that started before this
    // date while excluding events that only occur after the visible window.
    calendar.events.whose({ endDate: { _greaterThan: start }, startDate: { _lessThan: end } })().forEach(function (item) {
      const eventStart = safeDate(function () { return item.startDate(); });
      const eventEnd = safeDate(function () { return item.endDate(); }) || eventStart;
      if (!eventStart || eventStart >= end || eventEnd <= start) return;
      events.push({
        id: safeGet(function () { return item.uid(); }),
        calendar: String(calendar.name()),
        title: safeGet(function () { return item.summary(); }) || "(无标题日程)",
        start: eventStart.toISOString(),
        end: eventEnd ? eventEnd.toISOString() : eventStart.toISOString(),
        allDay: Boolean(safeValue(function () { return item.alldayEvent(); })),
        location: safeGet(function () { return item.location(); }),
        notes: safeGet(function () { return item.description(); }),
        recurring: Boolean(safeValue(function () { return item.recurrence(); }))
      });
    });
  });
  return JSON.stringify({
    events: events,
    calendars: allCalendars.map(function (calendar) {
      let writable = false;
      try { writable = Boolean(calendar.writable()); } catch (_) {}
      return { name: String(calendar.name()), writable: writable };
    })
  });
}
function generatedCalendar(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return ["birthdays", "us holidays", "siri suggestions", "生日", "节假日", "中国节假日", "siri 建议"].indexOf(normalized) >= 0 || / holidays$/.test(normalized);
}
function createEvent(request) {
  const calendarName = String(request.calendar || "").trim();
  const title = String(request.title || "").trim();
  if (!calendarName) throw new Error("Apple Calendar name is required");
  if (!title) throw new Error("Calendar event title is required");
  const app = Application("Calendar");
  const calendars = app.calendars.whose({ name: calendarName })();
  if (!calendars || calendars.length === 0) throw new Error("Calendar not found: " + calendarName);
  const calendar = calendars[0];
  let writable = false;
  try { writable = Boolean(calendar.writable()); } catch (_) {}
  if (!writable) throw new Error("Calendar is read-only: " + calendarName);
  const allDay = Boolean(request.allDay);
  const start = localDateTime(request.date, allDay ? "00:00" : request.startTime);
  const end = allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0) : localDateTime(request.date, request.endTime);
  if (end <= start) throw new Error("Calendar event end time must be after start time");
  const event = app.Event({ summary: title, startDate: start, endDate: end, alldayEvent: allDay });
  if (request.location) event.location = String(request.location);
  if (request.notes) event.description = String(request.notes);
  calendar.events.push(event);
  return {
    id: safeGet(function () { return event.uid(); }),
    calendar: String(calendar.name()),
    title: safeGet(function () { return event.summary(); }) || title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: allDay,
    location: safeGet(function () { return event.location(); }),
    notes: safeGet(function () { return event.description(); }),
    recurring: false
  };
}
function localDateTime(dateValue, timeValue) {
  const date = String(dateValue || "").split("-").map(Number);
  const time = String(timeValue || "").split(":").map(Number);
  if (date.length !== 3 || time.length !== 2 || date.some(isNaN) || time.some(isNaN)) throw new Error("Invalid calendar date or time");
  return new Date(date[0], date[1] - 1, date[2], time[0], time[1], 0, 0);
}
function safeGet(getter) { try { const value = getter(); return value == null ? "" : String(value); } catch (_) { return ""; } }
function safeValue(getter) { try { return getter(); } catch (_) { return null; } }
function safeDate(getter) { try { const value = getter(); return value ? new Date(value) : null; } catch (_) { return null; } }
`;

// Calendar may take a while to wake and hydrate subscribed calendars on the
// first request.  The agenda is opened deliberately by the user, so allow a
// bounded one-minute response instead of turning a cold Calendar launch into a
// false failure after 30 seconds.
const APPLE_CALENDAR_AGENDA_TIMEOUT_MS = 60_000;

export class AppleCalendarAgendaService {
  isAvailable(): boolean {
    return isMacOsDesktopRuntime();
  }

  async listEvents(options: { startDate: string; endDate: string; calendarNames: string[]; excludeGeneratedCalendars: boolean; cacheMinutes: number }): Promise<AppleCalendarAgendaResult> {
    if (!this.isAvailable()) {
      throw new Error("Apple Calendar agenda is available only in Obsidian Desktop on macOS");
    }
    const request = { startDate: options.startDate, endDate: options.endDate, calendarNames: options.calendarNames, excludeGeneratedCalendars: options.excludeGeneratedCalendars };
    const key = JSON.stringify(request);
    const cached = agendaCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    const existing = agendaRequests.get(key);
    if (existing) return existing;
    const requestPromise = this.runJxa<{ events: AppleCalendarAgendaEvent[]; calendars: Array<{ name: string; writable: boolean }> }>(request).then((response) => {
      const result = {
        events: response.events.sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title)),
        calendars: response.calendars,
        fetchedAt: new Date().toISOString()
      };
      agendaCache.set(key, { result, expiresAt: Date.now() + Math.max(1, options.cacheMinutes) * 60_000 });
      return result;
    }).finally(() => agendaRequests.delete(key));
    agendaRequests.set(key, requestPromise);
    return requestPromise;
  }

  async createEvent(input: CreateAppleCalendarEventInput): Promise<AppleCalendarAgendaEvent> {
    if (!this.isAvailable()) {
      throw new Error("Apple Calendar event creation is available only in Obsidian Desktop on macOS");
    }
    const event = await this.runJxa<AppleCalendarAgendaEvent>({ operation: "create", ...input });
    this.clearCache();
    return event;
  }

  clearCache(): void {
    agendaCache.clear();
  }

  private runJxa<T>(request: Record<string, unknown>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- callers check the macOS-only guard before Node access.
    const { execFile } = require("node:child_process") as typeof import("node:child_process");
    return new Promise<T>((resolve, reject) => {
      execFile(
        "/usr/bin/osascript",
        ["-l", "JavaScript", "-e", APPLE_CALENDAR_AGENDA_JXA, JSON.stringify(request)],
        { timeout: APPLE_CALENDAR_AGENDA_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(normalizeAppleCalendarAgendaError(stderr || error.message)));
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()) as T);
          } catch {
            reject(new Error("Apple Calendar returned an invalid response"));
          }
        }
      );
    });
  }
}

// Keep Calendar.app results available across tab changes and multiple workbench
// leaves.  Calendar's first JXA read can be expensive; a per-view cache was
// discarded whenever the user switched tabs and caused needless re-reads.
const agendaCache = new Map<string, { expiresAt: number; result: AppleCalendarAgendaResult }>();
const agendaRequests = new Map<string, Promise<AppleCalendarAgendaResult>>();

/**
 * Node's child-process timeout error embeds the full `osascript -e` command in
 * `error.message`.  That command contains the whole JXA program, which must
 * never be rendered in the agenda UI (and makes the three-column view unusable).
 */
export function normalizeAppleCalendarAgendaError(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (/not authorized|not permitted|permission|(-1743)|(-10004)/i.test(clean)) {
    return "Obsidian 没有访问 Apple 日历的权限，请在 macOS 系统设置 > 隐私与安全性中授权。";
  }
  if (/Command failed:\s*\/usr\/bin\/osascript|ETIMEDOUT|timed out|SIGTERM|killed/i.test(clean)) {
    return "读取 Apple 日历超时或暂时不可用，请稍后点击“刷新日程”重试。";
  }
  return clean.slice(0, 320) || "无法读取 Apple 日历，请稍后重试。";
}
