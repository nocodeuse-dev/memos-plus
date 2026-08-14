import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const calendarViewSource = readFileSync("src/taskCalendarView.ts", "utf8");
const editorUiSource = readFileSync("src/taskCalendarTaskEditorUi.ts", "utf8");
const actionsSource = readFileSync("src/taskActions.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");

describe("unified task management source integration", () => {
  it("keeps the emphasized and touch-friendly bottom status entry", () => {
    expect(mainSource).toContain("this.addStatusBarItem()");
    expect(mainSource).toContain('"memos-plus-task-status-item"');
    expect(mainSource).toContain('setIcon(item, "list-todo")');
    expect(mainSource).toContain("new QuickTaskPanel(this, item)");
    const start = stylesSource.indexOf(".status-bar-item.memos-plus-task-status-item {");
    const end = stylesSource.indexOf(".memos-plus-shell.is-composer-focused", start);
    const entryStyles = stylesSource.slice(start, end);
    expect(entryStyles).toContain("min-width: 34px;");
    expect(entryStyles).toContain("min-height: 30px;");
    expect(entryStyles).toContain("background-color: color-mix");
    expect(entryStyles).toContain("@media (pointer: coarse)");
    expect(entryStyles).toContain("min-width: 42px;");
    expect(entryStyles).toContain("min-height: 38px;");
    expect(entryStyles).not.toContain("box-shadow");
    expect(entryStyles).not.toContain("animation:");
  });

  it("routes legacy task entries into Schedule and tasks instead of a second modal", () => {
    expect(mainSource).not.toContain("TaskManagementModal");
    expect(mainSource).toContain('openTaskCalendar({ navigation: "all" })');
    expect(mainSource).toContain("openTaskCalendarFromOrganizer");
    expect(viewSource).toContain("this.plugin.openTaskCalendarFromOrganizer(id)");
    expect(viewSource).not.toContain("renderTaskIndexResults");
    expect(stylesSource).not.toContain(".memos-plus-task-manager-modal");
  });

  it("migrates the old modal's unique controls into the workspace", () => {
    expect(calendarViewSource).toContain("memos-plus-task-calendar-task-search");
    expect(calendarViewSource).toContain("memos-plus-task-calendar-task-priority");
    expect(calendarViewSource).toContain("memos-plus-task-calendar-task-project");
    expect(calendarViewSource).toContain("this.plugin.refreshTaskCalendarTasks()");
    expect(calendarViewSource).toContain("this.plugin.editTaskCalendarTask(currentTask)");
    expect(calendarViewSource).toContain("renderTaskCalendarTaskEditor");
    expect(calendarViewSource).toContain("this.plugin.openTaskCalendarQuickCapture()");
    expect(calendarViewSource).toContain("this.visibleTaskCount += Platform.isMobile ? 40 : 80");
  });

  it("keeps quick task creation in the unified workspace", () => {
    expect(calendarViewSource).toContain("memos-plus-task-calendar-quick-input");
    expect(calendarViewSource).toContain("this.plugin.openUnifiedTaskComposer");
    expect(calendarViewSource).not.toContain("parseNaturalLanguageTask(text)");
    expect(calendarViewSource).not.toContain("createTaskCalendarInboxTask(taskText, options.dueDate, options)");
    expect(mainSource).toContain('id: "quick-add-task"');
    expect(mainSource).toContain("focusQuickTask: true");
  });

  it("uses the same project filter for the task list and time axis", () => {
    expect(calendarViewSource).toContain('taskCalendarTasks(items, "all", selectedDate, { project: this.taskProject })');
    expect(calendarViewSource).toContain("this.renderAgenda(agenda, range.days, selectedDate, state.showAllDayEvents, agendaTasks)");
    expect(editorUiSource).toContain("session.apply({ projectTag: project.value })");
  });

  it("delegates recurrence-aware toggles and edits to the official Tasks API when available", () => {
    expect(actionsSource).toContain('plugins?.["obsidian-tasks-plugin"]?.apiV1');
    expect(actionsSource).toContain("executeToggleTaskDoneCommand(task.line, task.filePath)");
    expect(actionsSource).toContain("editTaskLineModal(task.line)");
    expect(actionsSource).toContain("replaceIndexedTaskLine");
  });
});
