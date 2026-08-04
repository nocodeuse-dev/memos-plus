import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_CALENDAR_SETTINGS,
  normalizeTaskCalendarSettings,
  shiftTaskCalendarDate,
  taskCalendarDateRange,
  taskCalendarTasks
} from "../src/taskCalendar";
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
      showAllDayEvents: true
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
  });

  it("keeps agenda sources independent from the writable Apple sync target", () => {
    expect(viewSource).toContain("this.agenda.isAvailable()");
    expect(viewSource).toContain("settings.taskCalendar.agendaCalendarNames");
    expect(viewSource).toContain("cacheMinutes: settings.taskCalendar.agendaCacheMinutes");
    expect(viewSource).not.toContain("settings.appleSyncTarget !==");
  });

  it("registers a dedicated workspace, commands, Ribbon option, and Markdown inbox writer", () => {
    expect(mainSource).toContain("MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE");
    expect(mainSource).toContain('id: "open-task-calendar"');
    expect(mainSource).toContain('id: "quick-add-task"');
    expect(mainSource).toContain("updateTaskCalendarRibbon");
    expect(mainSource).toContain("buildTasksMarkdownLine");
    expect(mainSource).toContain("任务收件箱");
  });
});
