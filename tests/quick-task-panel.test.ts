import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quickTaskPanelItems } from "../src/quickTaskPanelModel";
import type { TaskIndexItem } from "../src/taskIndex";

function task(title: string, overrides: Partial<TaskIndexItem> = {}): TaskIndexItem {
  return {
    filePath: "我的资源/Memos/任务收件箱.md",
    fileName: "任务收件箱",
    line: `- [ ] ${title}`,
    lineNumber: 1,
    text: title,
    title,
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

describe("quick task panel filters", () => {
  const today = "2026-08-14";
  const items = [
    task("今天未完成", { dueDate: today, dueTime: "09:00" }),
    task("今天已完成", { completed: true, dueDate: today, doneDate: today, dueTime: "08:00" }),
    task("昨天已完成", { completed: true, dueDate: "2026-08-13", doneDate: "2026-08-13" }),
    task("明天", { dueDate: "2026-08-15" }),
    task("第七天", { scheduledDate: "2026-08-20" }),
    task("第八天", { dueDate: "2026-08-21" }),
    task("最高", { priority: "highest" }),
    task("高", { priority: "high" }),
    task("中", { priority: "medium" }),
    task("逾期", { dueDate: "2026-08-10" }),
    task("已完成逾期", { completed: true, dueDate: "2026-08-10", doneDate: today })
  ];

  it("shows today's incomplete and completed tasks without old completions", () => {
    expect(quickTaskPanelItems(items, "today", today).map((item) => item.title)).toEqual([
      "今天未完成",
      "今天已完成",
      "已完成逾期"
    ]);
  });

  it("keeps the next seven days bounded and ordered by date", () => {
    expect(quickTaskPanelItems(items, "next-seven", today).map((item) => item.title)).toEqual([
      "今天未完成",
      "明天",
      "第七天"
    ]);
  });

  it("shows only incomplete high and highest priority tasks", () => {
    expect(quickTaskPanelItems(items, "important", today).map((item) => item.title)).toEqual(["最高", "高"]);
  });

  it("shows all dated incomplete overdue tasks", () => {
    expect(quickTaskPanelItems(items, "overdue", today).map((item) => item.title)).toEqual(["逾期"]);
  });
});

describe("quick task panel integration boundaries", () => {
  const mainSource = readFileSync("main.ts", "utf8");
  const panelSource = readFileSync("src/quickTaskPanel.ts", "utf8");
  const stylesSource = readFileSync("styles.css", "utf8");

  it("toggles from the status item and keeps the full workspace behind an explicit action", () => {
    expect(mainSource).toContain("new QuickTaskPanel(this, item)");
    expect(mainSource).toContain("this.quickTaskPanel?.toggle()");
    expect(panelSource).toContain('this.plugin.openTaskCalendar({ navigation: "all" })');
    expect(panelSource).toContain('event.key !== "Escape"');
    expect(panelSource).toContain("handleOutsidePointerDown");
  });

  it("reuses the shared task composer plus the existing task index, completion, source and editor APIs", () => {
    expect(panelSource).toContain("this.plugin.taskIndex.getItems()");
    expect(panelSource).toContain("this.plugin.openUnifiedTaskComposer");
    expect(panelSource).not.toContain("parseNaturalLanguageTask(text)");
    expect(panelSource).not.toContain("this.plugin.createTaskCalendarInboxTask");
    expect(panelSource).toContain("this.plugin.toggleTaskCalendarTask(task)");
    expect(panelSource).toContain("this.plugin.openTaskCalendarTask(task)");
    expect(panelSource).toContain("this.plugin.openTaskCalendarTaskEditor(task)");
    expect(panelSource).not.toContain("new TaskIndex");
    expect(panelSource).not.toContain("AppleSyncService");
  });

  it("renders a compact desktop popover and a mobile bottom drawer without animation", () => {
    expect(stylesSource).toContain(".memos-plus-quick-task-panel.is-mobile");
    expect(stylesSource).toContain("bottom: 0 !important;");
    expect(stylesSource).toContain("width: min(410px, calc(100vw - 20px));");
    const start = stylesSource.indexOf(".memos-plus-quick-task-panel {");
    const end = stylesSource.indexOf(".memos-plus-shell.is-composer-focused", start);
    expect(stylesSource.slice(start, end)).not.toContain("animation:");
    expect(stylesSource.slice(start, end)).not.toContain("box-shadow:");
  });
});
