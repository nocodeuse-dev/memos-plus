import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_CALENDAR_SETTINGS,
  formatTaskCalendarMonth,
  normalizeTaskCalendarSettings,
  shiftTaskCalendarDate,
  shiftTaskCalendarMonth,
  taskCalendarDefaultAgendaNames,
  taskCalendarDateRange,
  taskCalendarMonthDays,
  taskCalendarOpenOptionsForOrganizer,
  taskCalendarTasks
} from "../src/taskCalendar";
import { normalizeAppleCalendarAgendaError } from "../src/appleCalendarAgenda";
import { taskCalendarGridPlacement } from "../src/taskCalendarAgendaGrid";
import type { TaskIndexItem } from "../src/taskIndex";

function task(overrides: Partial<TaskIndexItem> = {}): TaskIndexItem {
  return {
    filePath: "我的资源/Memos/任务收件箱.md",
    fileName: "任务收件箱",
    line: "- [ ] 示例任务",
    lineNumber: 1,
    text: "示例任务",
    capturedAt: "",
    capturedAtTime: 0,
    completed: false,
    priority: "none",
    dueDate: "",
    scheduledDate: "",
    startDate: "",
    createdDate: "",
    doneDate: "",
    recurring: false,
    mtime: 0,
    ...overrides
  };
}

describe("Schedule and tasks state", () => {
  it("starts as a lightweight, opt-in workspace with a Markdown inbox", () => {
    expect(DEFAULT_TASK_CALENDAR_SETTINGS).toMatchObject({
      showRibbon: true,
      defaultView: "today",
      inboxPath: "我的资源/Memos/任务收件箱.md",
      viewMode: "day",
      agendaCacheMinutes: 5,
      agendaCalendarNames: [],
      showAllDayEvents: true,
      showHomeEntry: true,
      showMobileQuickActions: true
    });
  });

  it("normalizes invalid persisted state without changing the inbox default", () => {
    expect(normalizeTaskCalendarSettings({
      defaultView: "unknown",
      inboxPath: " /Projects/Inbox ",
      viewMode: "month",
      agendaCacheMinutes: 100,
      agendaCalendarNames: ["Calendar", " calendar ", "Work", ""]
    })).toMatchObject({
      defaultView: "today",
      inboxPath: "Projects/Inbox.md",
      viewMode: "day",
      agendaCacheMinutes: 30,
      agendaCalendarNames: ["Calendar", "Work"]
    });
  });

  it("keeps generated Calendar feeds available but excludes them from the default agenda read", () => {
    const calendars = ["Home", "工作", "个人", "yang122395@gmail.com", "Scheduled Reminders", "Birthdays", "US Holidays", "Siri Suggestions"];
    expect(taskCalendarDefaultAgendaNames(calendars)).toEqual(["Home", "工作", "个人", "yang122395@gmail.com", "Scheduled Reminders"]);
  });

  it("builds bounded local day and Monday-first week windows", () => {
    expect(taskCalendarDateRange("2026-08-05", "day")).toEqual({
      startDate: "2026-08-05",
      endDate: "2026-08-06",
      days: ["2026-08-05"]
    });
    expect(taskCalendarDateRange("2026-08-05", "week")).toEqual({
      startDate: "2026-08-03",
      endDate: "2026-08-10",
      days: ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]
    });
    expect(shiftTaskCalendarDate("2026-08-05", "week", -1)).toBe("2026-07-29");
  });

  it("builds a Monday-first compact month navigator and preserves month navigation", () => {
    const days = taskCalendarMonthDays("2026-08-05", new Date("2026-08-05T12:00:00"));
    expect(days).toHaveLength(42);
    expect(days[0]?.date).toBe("2026-07-27");
    expect(days.find((day) => day.date === "2026-08-05")).toMatchObject({ inCurrentMonth: true, isToday: true });
    expect(shiftTaskCalendarMonth("2026-08-05", 1)).toBe("2026-09-01");
    expect(formatTaskCalendarMonth("2026-08-05", "en-US")).toContain("August");
  });

  it("places timed events within the visible calendar grid without treating all-day events as timed blocks", () => {
    const days = ["2026-08-03", "2026-08-04", "2026-08-05"];
    expect(taskCalendarGridPlacement({ start: "2026-08-05T07:30:00", end: "2026-08-05T11:30:00", allDay: false }, days)).toEqual({
      dayIndex: 2,
      top: 96,
      height: 256
    });
    expect(taskCalendarGridPlacement({ start: "2026-08-05T00:00:00", end: "2026-08-06T00:00:00", allDay: true }, days)).toBeNull();
  });

  it("uses the existing task index for today, inbox, all and completed lists", () => {
    const tasks = [
      task({ text: "逾期", dueDate: "2026-08-04" }),
      task({ text: "今天", scheduledDate: "2026-08-05" }),
      task({ text: "收件箱" }),
      task({ text: "已完成", completed: true, dueDate: "2026-08-05" })
    ];

    expect(taskCalendarTasks(tasks, "today", "2026-08-05").map((item) => item.text)).toEqual(["逾期", "今天"]);
    expect(taskCalendarTasks(tasks, "inbox", "2026-08-05").map((item) => item.text)).toEqual(["收件箱"]);
    expect(taskCalendarTasks(tasks, "all", "2026-08-05").map((item) => item.text)).toEqual(["逾期", "今天", "收件箱"]);
    expect(taskCalendarTasks(tasks, "completed", "2026-08-05").map((item) => item.text)).toEqual(["已完成"]);
  });

  it("supports overdue, text, priority and project context in the unified task list", () => {
    const tasks = [
      task({ text: "项目甲高优先级", line: "- [ ] 项目甲高优先级 #项目/甲", priority: "high", dueDate: "2026-08-04" }),
      task({ text: "项目甲普通", line: "- [ ] 项目甲普通 #项目/甲", filePath: "项目/甲.md" }),
      task({ text: "项目乙", line: "- [ ] 项目乙 #项目/乙", priority: "high" })
    ];
    expect(taskCalendarTasks(tasks, "overdue", "2026-08-05").map((item) => item.text)).toEqual(["项目甲高优先级"]);
    expect(taskCalendarTasks(tasks, "all", "2026-08-05", { query: "普通" }).map((item) => item.text)).toEqual(["项目甲普通"]);
    expect(taskCalendarTasks(tasks, "all", "2026-08-05", { priority: "high" }).map((item) => item.text)).toEqual(["项目甲高优先级", "项目乙"]);
    expect(taskCalendarTasks(tasks, "all", "2026-08-05", { project: { label: "甲", filePath: "项目/甲.md", tag: "项目/甲" } }).map((item) => item.text)).toEqual([
      "项目甲高优先级",
      "项目甲普通"
    ]);
  });

  it("maps organizer task entries to the matching workspace context", () => {
    expect(taskCalendarOpenOptionsForOrganizer("tasks")).toEqual({ navigation: "all" });
    expect(taskCalendarOpenOptionsForOrganizer("task-overdue")).toEqual({ navigation: "overdue" });
    expect(taskCalendarOpenOptionsForOrganizer("task-priority-high")).toEqual({ navigation: "all", priority: "high" });
    expect(taskCalendarOpenOptionsForOrganizer("today")).toBeNull();
  });

  it("keeps tomorrow and week task views bounded to their intended dates", () => {
    const tasks = [
      task({ text: "逾期", dueDate: "2026-08-04" }),
      task({ text: "周内", dueDate: "2026-08-09" }),
      task({ text: "下周", dueDate: "2026-08-10" })
    ];
    expect(taskCalendarTasks(tasks, "tomorrow", "2026-08-06").map((item) => item.text)).toEqual(["逾期"]);
    expect(taskCalendarTasks(tasks, "week", "2026-08-05").map((item) => item.text)).toEqual(["逾期", "周内"]);
  });
});

describe("Schedule and tasks integration boundaries", () => {
  const agendaSource = readFileSync("src/appleCalendarAgenda.ts", "utf8");
  const eventModalSource = readFileSync("src/taskCalendarEventModal.ts", "utf8");
  const eventDetailModalSource = readFileSync("src/taskCalendarEventDetailModal.ts", "utf8");
  const viewSource = readFileSync("src/taskCalendarView.ts", "utf8");
  const mainSource = readFileSync("main.ts", "utf8");

  it("reads Apple Calendar only after the macOS guard and keeps agenda access separate from syncing", () => {
    const guardIndex = agendaSource.indexOf("if (!this.isAvailable())");
    const requireIndex = agendaSource.indexOf('require("node:child_process")');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(requireIndex).toBeGreaterThan(guardIndex);
    expect(agendaSource).not.toContain("upsert");
    expect(agendaSource).not.toContain("createContainer");
    expect(agendaSource).not.toContain("tasks.json");
    expect(agendaSource).toContain("APPLE_CALENDAR_AGENDA_TIMEOUT_MS");
    expect(agendaSource).toContain("normalizeAppleCalendarAgendaError(stderr || error.message)");
    expect(agendaSource).toContain("excludeGeneratedCalendars");
    expect(agendaSource).toContain("generatedCalendar(name)");
    expect(agendaSource).toContain("agendaRequests");
    expect(agendaSource).toContain("calendar.events.whose({ endDate: { _greaterThan: start }, startDate: { _lessThan: end } })()");
    expect(agendaSource).not.toContain("calendar.events().forEach");
  });

  it("never renders the full osascript command when Calendar is slow or unavailable", () => {
    const commandError = "Command failed: /usr/bin/osascript -l JavaScript -e function run(argv) { /* private JXA source */ } {\\\"startDate\\\":\\\"2026-08-05\\\"}";
    expect(normalizeAppleCalendarAgendaError(commandError)).toBe("读取 Apple 日历超时或暂时不可用，请稍后点击“刷新日程”重试。");
    expect(normalizeAppleCalendarAgendaError("Not authorized to send Apple events to Calendar. (-1743)")).toContain("隐私与安全性");
  });

  it("keeps agenda sources independent from the writable Apple sync target", () => {
    expect(viewSource).toContain("this.agenda.isAvailable()");
    expect(viewSource).toContain("settings.taskCalendar.agendaCalendarNames");
    expect(viewSource).toContain("cacheMinutes: settings.taskCalendar.agendaCacheMinutes");
    expect(viewSource).not.toContain("settings.appleSyncTarget !==");
    expect(viewSource.slice(viewSource.indexOf("async onOpen"), viewSource.indexOf("async onClose"))).not.toContain("this.plugin.appleSync.probe(\"calendar\")");
    expect(viewSource).toContain("toggleCalendarFilter");
    expect(viewSource).toContain("taskCalendarDefaultAgendaNames");
    expect(viewSource).toContain("result.calendars");
    expect(viewSource).toContain("taskCalendarGridPlacement");
    expect(viewSource).toContain("renderMiniCalendar");
    expect(viewSource).toContain("calendarEventLocalDate(event.start)");
    expect(viewSource).toContain("createTaskCalendarInboxTask(eventTaskText(selectedEvent), calendarEventLocalDate(selectedEvent.start))");
    expect(viewSource).toContain("refreshScheduleAndTasks");
    expect(viewSource).toContain("this.plugin.refreshTaskCalendarTasks()");
    expect(mainSource).toContain("await this.syncAppleNow(false)");
  });

  it("registers a dedicated workspace, commands, Ribbon option, and Markdown inbox writer", () => {
    expect(mainSource).toContain("MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE");
    expect(mainSource).toContain('id: "open-task-calendar"');
    expect(mainSource).toContain('id: "quick-add-task"');
    expect(mainSource).toContain("updateTaskCalendarRibbon");
    expect(mainSource).toContain("openTaskOptionsModal");
    expect(mainSource).toContain("renderTaskContentWithOptions");
    expect(mainSource).toContain("任务收件箱");
  });

  it("keeps home and mobile shortcuts as explicit navigation actions", () => {
    const viewSource = readFileSync("src/view.ts", "utf8");
    expect(viewSource).toContain("renderTaskCalendarHomeEntry");
    expect(viewSource).toContain("showHomeEntry");
    expect(viewSource).toContain("showMobileQuickActions");
    expect(viewSource).toContain("memos-plus-mobile-quick-actions");
    expect(viewSource).toContain("this.plugin.openTaskCalendar({ focusQuickTask: true })");
    expect(viewSource).toContain("view.openEventComposer()");
    expect(viewSource).toContain("openQuickCaptureFromMobileFab");
  });

  it("creates Apple events only from an explicit calendar-event action", () => {
    expect(agendaSource).toContain('request.operation === "create"');
    expect(agendaSource).toContain("async createEvent(input");
    expect(agendaSource).toContain("Calendar is read-only");
    expect(mainSource).toContain('id: "quick-add-calendar-event"');
    expect(viewSource).toContain('"calendar-plus"');
    expect(eventModalSource).toContain("const event = await this.options.createEvent(input)");
    expect(eventModalSource).toContain('text: t(lang, "taskCalendar.createEvent")');
    expect(eventModalSource.slice(0, eventModalSource.indexOf("private async save"))).not.toContain("this.options.createEvent(");
  });

  it("opens event details and keeps task and quick-note creation explicit", () => {
    expect(viewSource).toContain("openEventDetails(event)");
    expect(viewSource).toContain("new TaskCalendarEventDetailModal");
    expect(viewSource).toContain("createTaskCalendarInboxTask(eventTaskText");
    expect(viewSource).toContain("new QuickCaptureModal");
    expect(eventDetailModalSource).toContain("taskCalendar.eventCreateTask");
    expect(eventDetailModalSource).toContain("taskCalendar.eventQuickCapture");
    expect(eventDetailModalSource).toContain("const created = await this.options.onCreateTask");
    expect(eventDetailModalSource).not.toContain("createEvent(");
  });
});
