import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_CALENDAR_SETTINGS,
  formatTaskCalendarMonth,
  normalizeTaskCalendarSettings,
  shiftTaskCalendarDate,
  shiftTaskCalendarMonth,
  taskCalendarCompletedOnDate,
  taskCalendarDefaultAgendaNames,
  taskCalendarDateRange,
  taskCalendarMonthDays,
  taskCalendarOpenOptionsForOrganizer,
  taskCalendarTasks,
  toggleTaskCalendarSidebar
} from "../src/taskCalendar";
import { normalizeAppleCalendarAgendaError } from "../src/appleCalendarAgenda";
import { taskCalendarDropTime, taskCalendarGridPlacement, taskCalendarTimedTaskPlacement } from "../src/taskCalendarAgendaGrid";
import type { TaskIndexItem } from "../src/taskIndex";

function task(overrides: Partial<TaskIndexItem> = {}): TaskIndexItem {
  return {
    filePath: "我的资源/Memos/任务收件箱.md",
    fileName: "任务收件箱",
    line: "- [ ] 示例任务",
    lineNumber: 1,
    text: "示例任务",
    title: "示例任务",
    capturedAt: "",
    capturedAtTime: 0,
    completed: false,
    priority: "none",
    dueDate: "",
    scheduledDate: "",
    startDate: "",
    createdDate: "",
    doneDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    dueTime: "",
    reminderDate: "",
    reminderTime: "",
    allDay: false,
    syncTarget: "",
    appleSyncId: "",
    appleSyncTagged: false,
    recurring: false,
    mtime: 0,
    ...overrides,
    completedAt: overrides.completedAt ?? ""
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
      sidebarCollapsed: false,
      sidebarExpandedManually: false,
      navigationWidth: 232,
      taskPaneWidth: 420,
      showSidebarCalendar: true,
      showSidebarCalendarList: false,
      showAllDayEvents: true,
      showHomeEntry: true,
      showMobileQuickActions: true,
      quickPanelTab: "today"
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

  it("remembers only supported quick task panel tabs", () => {
    expect(normalizeTaskCalendarSettings({ quickPanelTab: "important" }).quickPanelTab).toBe("important");
    expect(normalizeTaskCalendarSettings({ quickPanelTab: "unknown" }).quickPanelTab).toBe("today");
  });

  it("shows the shared sidebar calendar by default while keeping its source list hidden", () => {
    expect(normalizeTaskCalendarSettings({})).toMatchObject({
      showSidebarCalendar: true,
      showSidebarCalendarList: false
    });
    expect(normalizeTaskCalendarSettings({ showSidebarCalendar: false, showSidebarCalendarList: true })).toMatchObject({
      showSidebarCalendar: false,
      showSidebarCalendarList: true
    });
  });

  it("exposes the sidebar calendar module and its separate source-list setting in desktop home appearance settings", () => {
    const settingsSource = readFileSync("src/settings.ts", "utf8");
    const i18nSource = readFileSync("src/i18n.ts", "utf8");
    expect(settingsSource).toContain("private renderLayoutSidebarCalendarInspector");
    expect(settingsSource).toContain("settings.homeCalendarList");
    expect(i18nSource).toContain('"settings.homeCalendarList": "显示日历来源列表"');
  });

  it("migrates legacy date shortcuts and bounds remembered desktop pane widths", () => {
    expect(normalizeTaskCalendarSettings({
      defaultView: "week",
      navigation: "tomorrow",
      navigationWidth: 900,
      taskPaneWidth: 10
    })).toMatchObject({
      defaultView: "upcoming",
      navigation: "upcoming",
      navigationWidth: 320,
      taskPaneWidth: 340
    });
  });

  it("migrates the legacy compact pane defaults to readable desktop widths", () => {
    expect(normalizeTaskCalendarSettings({ navigationWidth: 152, taskPaneWidth: 320 })).toMatchObject({
      navigationWidth: 232,
      taskPaneWidth: 420
    });
  });

  it("keeps today-completed tasks on their actual completion day and orders completed views by precise time", () => {
    const completed = [
      task({ title: "较早完成", completed: true, doneDate: "2026-08-11", completedAt: "2026-08-11T09:10:00" }),
      task({ title: "较晚完成", completed: true, doneDate: "2026-08-11", completedAt: "2026-08-11T17:30:00" })
    ];

    expect(taskCalendarCompletedOnDate(completed[0]!, "2026-08-11")).toBe(true);
    expect(taskCalendarTasks(completed, "completed", "2026-08-11").map((item) => item.title)).toEqual(["较晚完成", "较早完成"]);
  });

  it("migrates the previous task pane default while preserving custom widths", () => {
    expect(normalizeTaskCalendarSettings({ taskPaneWidth: 390 }).taskPaneWidth).toBe(420);
    expect(normalizeTaskCalendarSettings({ taskPaneWidth: 549 }).taskPaneWidth).toBe(549);
  });

  it("lets a manual desktop toggle override responsive auto-collapse without changing mobile state", () => {
    expect(toggleTaskCalendarSidebar({ sidebarCollapsed: false, sidebarExpandedManually: false }, true, false)).toEqual({
      sidebarCollapsed: false,
      sidebarExpandedManually: true
    });
    expect(toggleTaskCalendarSidebar({ sidebarCollapsed: true, sidebarExpandedManually: false }, false, false)).toEqual({
      sidebarCollapsed: false,
      sidebarExpandedManually: true
    });
    expect(toggleTaskCalendarSidebar({ sidebarCollapsed: false, sidebarExpandedManually: true }, false, false)).toEqual({
      sidebarCollapsed: true,
      sidebarExpandedManually: false
    });
    expect(toggleTaskCalendarSidebar({ sidebarCollapsed: true, sidebarExpandedManually: false }, false, true)).toEqual({
      sidebarCollapsed: true,
      sidebarExpandedManually: false
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

  it("places a concrete Reminder due time on the matching local task timeline", () => {
    const days = ["2026-08-10"];
    const placement = taskCalendarTimedTaskPlacement(task({ dueDate: "2026-08-10", dueTime: "17:31", syncTarget: "reminders" }), days);
    expect(placement).toEqual(expect.objectContaining({ dayIndex: 0, height: 32 }));
    expect(placement?.top).toBeCloseTo(737.07, 2);
    expect(taskCalendarTimedTaskPlacement(task({ dueDate: "2026-08-10", dueTime: "17:31", allDay: true }), days)).toBeNull();
  });

  it("recognizes tasks completed on the selected day without losing legacy dated completions", () => {
    expect(taskCalendarCompletedOnDate(task({ completed: true, doneDate: "2026-08-11", dueDate: "2026-08-10" }), "2026-08-11")).toBe(true);
    expect(taskCalendarCompletedOnDate(task({ completed: true, doneDate: "2026-08-10", dueDate: "2026-08-11" }), "2026-08-11")).toBe(false);
    expect(taskCalendarCompletedOnDate(task({ completed: true, dueDate: "2026-08-11" }), "2026-08-11")).toBe(true);
    expect(taskCalendarCompletedOnDate(task({ completed: false, dueDate: "2026-08-11" }), "2026-08-11")).toBe(false);
  });

  it("filters the shared task list to tasks completed on the selected day", () => {
    const tasks = [
      task({ text: "今天完成", completed: true, doneDate: "2026-08-11", dueDate: "2026-08-10" }),
      task({ text: "旧任务兼容", completed: true, dueDate: "2026-08-11" }),
      task({ text: "昨天完成", completed: true, doneDate: "2026-08-10", dueDate: "2026-08-11" }),
      task({ text: "未完成", completed: false, dueDate: "2026-08-11" })
    ];

    expect(taskCalendarTasks(tasks, "today", "2026-08-11", { completedOnDate: "2026-08-11" }).map((item) => item.text)).toEqual([
      "今天完成",
      "旧任务兼容"
    ]);
  });

  it("snaps a dropped task to the nearest 15-minute grid time", () => {
    expect(taskCalendarDropTime(737.1, 0)).toBe("17:30");
    expect(taskCalendarDropTime(-20, 0)).toBe("06:00");
    expect(taskCalendarDropTime(2_000, 0)).toBe("21:45");
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
    expect(taskCalendarOpenOptionsForOrganizer("task-due-this-week")).toEqual({ navigation: "upcoming", selectedDate: expect.any(String), viewMode: "week" });
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
    expect(taskCalendarTasks(tasks, "upcoming", "2026-08-05").map((item) => item.text)).toEqual(["周内", "下周"]);
  });
});

describe("Schedule and tasks integration boundaries", () => {
  const agendaSource = readFileSync("src/appleCalendarAgenda.ts", "utf8");
  const eventModalSource = readFileSync("src/taskCalendarEventModal.ts", "utf8");
  const eventDetailModalSource = readFileSync("src/taskCalendarEventDetailModal.ts", "utf8");
  const viewSource = readFileSync("src/taskCalendarView.ts", "utf8");
  const homeViewSource = readFileSync("src/view.ts", "utf8");
  const workbenchNavigationSource = readFileSync("src/workbenchNavigation.ts", "utf8");
  const editorUiSource = readFileSync("src/taskCalendarTaskEditorUi.ts", "utf8");
  const stylesSource = readFileSync("styles.css", "utf8");
  const mainSource = readFileSync("main.ts", "utf8");

  it("reads Apple Calendar only after the macOS guard and keeps agenda access separate from syncing", () => {
    const guardIndex = agendaSource.indexOf("if (!this.isAvailable())");
    const runnerIndex = agendaSource.indexOf("this.runJxa<");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(runnerIndex).toBeGreaterThan(guardIndex);
    expect(agendaSource).not.toContain("upsert");
    expect(agendaSource).not.toContain("createContainer");
    expect(agendaSource).not.toContain("tasks.json");
    expect(agendaSource).toContain("APPLE_CALENDAR_AGENDA_TIMEOUT_MS");
    expect(agendaSource).toContain("normalizeError: normalizeAppleCalendarAgendaError");
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
    expect(viewSource).not.toContain("renderMiniCalendar");
    expect(homeViewSource).toContain("renderFixedSidebarCalendar(fixedTop)");
    expect(viewSource).toContain("calendarEventLocalDate(event.start)");
    expect(viewSource).toContain("createTaskCalendarInboxTask(eventTaskText(selectedEvent), calendarEventLocalDate(selectedEvent.start))");
    expect(viewSource).toContain("refreshScheduleAndTasks");
    expect(viewSource).toContain("this.plugin.refreshTaskCalendarTasks()");
    expect(mainSource).toContain("await this.syncAppleNow(false)");
  });

  it("mounts the task surface immediately without an ItemView lifecycle of its own", () => {
    const mountMethod = viewSource.slice(viewSource.indexOf("mount(): void"), viewSource.indexOf("unmount(): void"));
    const renderMethod = viewSource.slice(viewSource.indexOf("private render(): void"), viewSource.indexOf("private renderContent(): void"));
    expect(viewSource).not.toContain("private opened");
    expect(mountMethod.indexOf("this.viewActive = true")).toBeLessThan(mountMethod.indexOf("this.render()"));
    expect(mountMethod.indexOf("this.render()")).toBeLessThan(mountMethod.indexOf("this.loadTaskProjects()"));
    expect(renderMethod).toContain("if (!this.viewActive) return");
    expect(renderMethod).not.toContain("this.host.isConnected");
    expect(renderMethod).toContain("this.renderContent()");
    expect(renderMethod).toContain("Failed to render Schedule and Tasks");
  });

  it("uses the shared Memos Plus view when applying task navigation", () => {
    expect(viewSource).not.toMatch(/\n\s*open\(options:\s*TaskCalendarOpenOptions/);
    expect(viewSource).toContain("applyOpenOptions(options: TaskCalendarOpenOptions = {})");
    expect(mainSource).toContain("return this.activateView(preferredLeaf)");
    expect(mainSource).toContain("leaf.view.openTaskWorkbench(options ?? {})");
  });

  it("uses one shared sidebar and swaps only its content area between directory, tasks and learning", () => {
    expect(workbenchNavigationSource).toContain("renderWorkbenchNavigation");
    expect(workbenchNavigationSource).toContain("workbenchTaskRouteOptions");
    expect(homeViewSource).toContain("renderSharedWorkbenchNavigation");
    expect(homeViewSource).toContain("new TaskCalendarSurface(this.plugin, main");
    expect(homeViewSource).toContain("renderSidebarCalendarSources(fixedTop)");
    expect(homeViewSource).toContain("this.openTaskWorkbench(workbenchTaskRouteOptions(route, today))");
    expect(homeViewSource).toContain("this.applyWorkbenchDirectoryOptions()");
    expect(mainSource).toContain("async openWorkbenchDirectory(options: WorkbenchDirectoryOptions = {}, preferredLeaf?: WorkspaceLeaf)");
    expect(mainSource).toContain("preferredLeaf ?? this.app.workspace.getLeaf(false)");
    expect(mainSource).toContain("preferredLeaf ? null : this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE)[0]");
    expect(mainSource).not.toContain("getLeavesOfType(MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE)[0]");
    expect(viewSource).not.toContain("memos-plus-task-calendar-navigation" );
  });

  it("renders parsed task time and Apple sync status and listens for task-index changes", () => {
    expect(viewSource).toContain("task.dueTime");
    expect(viewSource).toContain("taskAppleSyncStatus(task)");
    expect(mainSource).toContain("appleSyncState.pending[recordKey]");
    expect(viewSource).toContain("taskCalendarTimedTaskPlacement(task, days)");
    expect(viewSource).toContain("this.plugin.taskIndex.onChange(() => this.handleTaskIndexChange())");
    expect(viewSource).toContain("memos-plus-task-calendar-task-heading");
    expect(viewSource).toContain("memos-plus-task-calendar-task-source");
    expect(viewSource).toContain("taskSourceLabel(task.filePath)");
  });

  it("keeps today's completed tasks on the timeline and exposes a default-visible completed section", () => {
    expect(viewSource).toContain("taskCalendarCompletedOnDate(task, day)");
    expect(viewSource).toContain("memos-plus-task-calendar-completed-row");
    expect(viewSource).toContain("this.hideCompletedToday = !this.hideCompletedToday");
    expect(viewSource).toContain('task.completed ? " is-completed" : ""');
    expect(viewSource).not.toContain("tasks.filter((task) => !task.completed && Boolean(task.dueTime)");
    expect(stylesSource).toContain(".memos-plus-task-calendar-timed-task.is-completed");
    expect(stylesSource).toContain("text-decoration: line-through");
  });

  it("keeps completed date labels visible when a compact timeline task title is long", () => {
    const completedTaskSource = viewSource.slice(viewSource.indexOf("private renderCompletedTask"), viewSource.indexOf("private renderEvent"));
    expect(completedTaskSource).toContain("memos-plus-task-calendar-completed-task-title");
    expect(completedTaskSource).toContain("memos-plus-task-calendar-completed-at");
    expect(completedTaskSource).toContain("taskCompletionTooltip(task");
    expect(stylesSource).toContain(".memos-plus-task-calendar-completed-task-title { min-width: 0; overflow: hidden;");
    expect(stylesSource).toContain(".memos-plus-task-calendar-completed-task-body .memos-plus-task-calendar-completed-at { flex: 0 0 auto;");
  });

  it("opens today's completed tasks from the summary without duplicating task-row actions", () => {
    expect(viewSource).toContain("summaryActionCard(");
    expect(viewSource).toContain("this.openCompletedToday(selectedDate)");
    expect(viewSource).toContain("completedOnDate");
    expect(viewSource).toContain('"aria-pressed": String(active)');
    expect(stylesSource).toContain(".memos-plus-task-calendar-summary-action.is-active");
  });

  it("refreshes Reminders with the task index and shows concrete Apple failures", () => {
    expect(mainSource).toContain("await this.syncAppleNow(false)");
    expect(viewSource).toContain("appleSyncState.lastError.trim()");
    expect(viewSource).toContain("memos-plus-task-calendar-reminders-error");
    expect(viewSource).toContain("this.renderForced();");
  });

  it("keeps task row actions independent and opens the editor only from settings", () => {
    const renderTaskSource = viewSource.slice(viewSource.indexOf("private renderTask(container"), viewSource.indexOf("private taskAppleSyncStatus"));
    expect(renderTaskSource).toContain('checkbox.addEventListener("click", (event) => event.stopPropagation())');
    expect(renderTaskSource).toContain("this.plugin.openTaskCalendarTask(task)");
    expect(renderTaskSource).toContain('this.iconButton(item, "settings-2"');
    expect(renderTaskSource).toContain("() => this.selectTask(task)");
    expect(renderTaskSource).not.toContain("editTaskCalendarTask(task)");
    expect(stylesSource).toContain("grid-template-columns: 20px minmax(0, 1fr) 34px");
    expect(stylesSource).toContain(".memos-plus-task-calendar-task-settings");
  });

  it("keeps desktop panes readable with one saved sidebar before the agenda and task panes", () => {
    expect(stylesSource).toContain("--memos-plus-unified-sidebar-width, 232px");
    expect(stylesSource).toContain("--memos-plus-task-calendar-task-width, 420px");
    expect(stylesSource).toContain("@container memos-plus-task-calendar (max-width: 1080px)");
    expect(stylesSource).toContain(".memos-plus-unified-shell.is-unified-sidebar-collapsed");
    expect(homeViewSource).toContain("sidebarScrollTop");
    expect(homeViewSource).toContain("memos-plus-unified-sidebar-resizer");
    expect(stylesSource).toContain("justify-self: stretch");
    expect(stylesSource).toContain(".memos-plus-task-calendar.is-unified-content .memos-plus-task-calendar-layout");
    expect(stylesSource).toContain(".memos-plus-task-calendar.is-desktop:not(.is-unified-content):not(.is-tasks-hidden):not(.is-sidebar-force-expanded) .memos-plus-task-calendar-layout");
    expect(stylesSource).toContain(".memos-plus-task-calendar-task-body { display: block;");
    expect(stylesSource).toContain("-webkit-line-clamp: 2");
    expect(stylesSource).toContain(".memos-plus-task-calendar-task-source");
    expect(stylesSource).toContain(".memos-plus-task-calendar.is-tasks-hidden .memos-plus-task-calendar-pane-header h3 { display: none; }");
    expect(stylesSource).toContain(".memos-plus-task-calendar.is-tasks-hidden .memos-plus-task-calendar-tasks-toggle { width: 32px; height: 32px;");
  });

  it("keeps task scheduling and editing inside the existing workspace components", () => {
    expect(viewSource).toContain("taskCalendarDropTime(event.clientY");
    expect(viewSource).toContain('draggable: "true"');
    expect(viewSource).toContain("updateTaskCalendarTask(task, patch)");
    expect(viewSource).toContain("memos-plus-task-calendar-task-details");
    expect(editorUiSource).toContain("taskCalendarPostponeDate(kind)");
    expect(viewSource).toContain("renderTaskCalendarTaskEditor(container");
    expect(viewSource).toContain("new Menu()");
    expect(homeViewSource).toContain("navigationWidth");
    expect(viewSource).toContain("taskPaneWidth");
    expect(viewSource).toContain("this.host.style.setProperty(side === \"left\" ? \"--memos-plus-task-calendar-nav-width\" : \"--memos-plus-task-calendar-task-width\"");
    expect(viewSource).not.toContain('this.host.querySelector<HTMLElement>(".memos-plus-task-calendar")');
  });

  it("keeps inline field feedback independent from Markdown indexing and Apple sync", () => {
    expect(editorUiSource).toContain('title.addEventListener("input"');
    expect(editorUiSource).toContain('date.addEventListener("change"');
    expect(editorUiSource).toContain('priority.addEventListener("change"');
    expect(editorUiSource).toContain('tags.addEventListener("input"');
    expect(viewSource).toContain("this.plugin.createTaskCalendarEditSession(task)");
    expect(mainSource).toContain("updateTaskCalendarTask(sourceTask, patch, false)");
    expect(editorUiSource).not.toContain('form.addEventListener("focusout"');
    expect(mainSource).toContain("void this.syncAppleNow(false)");
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

  it("opens and restores the workspace on the current date by default", () => {
    expect(viewSource).toContain("this.plugin.settings.taskCalendar.selectedDate = todayTaskCalendarDate();");
    expect(viewSource).toContain("openDefault(): void");
    expect(viewSource).toContain("selectedDate: todayTaskCalendarDate(),");
  });

  it("keeps home and mobile shortcuts as explicit navigation actions", () => {
    const viewSource = readFileSync("src/view.ts", "utf8");
    expect(viewSource).toContain("renderTaskCalendarHomeEntry");
    expect(viewSource).toContain("showHomeEntry");
    expect(viewSource).toContain("showMobileQuickActions");
    expect(viewSource).toContain("memos-plus-mobile-quick-actions");
    expect(viewSource).toContain("this.plugin.openTaskCalendar({ focusQuickTask: true }, this.leaf)");
    expect(viewSource).toContain("this.openTaskEventComposer()");
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
