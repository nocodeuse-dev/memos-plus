import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { taskAtMarkdownLine } from "../src/currentTaskEditor";

const mainSource = readFileSync("main.ts", "utf8");
const modalSource = readFileSync("src/taskCalendarTaskEditorModal.ts", "utf8");
const editorUiSource = readFileSync("src/taskCalendarTaskEditorUi.ts", "utf8");
const calendarViewSource = readFileSync("src/taskCalendarView.ts", "utf8");

const file = {
  path: "我的资源/任务.md",
  basename: "任务",
  stat: { mtime: 123 }
};

describe("current Markdown task editor", () => {
  it("reads the task at the actual editor line and preserves file coordinates", () => {
    const task = taskAtMarkdownLine("  - [x] 复诊 📅 2026-08-10 ⏰ 17:31 #门诊", 41, file as never);
    expect(task).toMatchObject({
      filePath: "我的资源/任务.md",
      fileName: "任务",
      lineNumber: 42,
      completed: true,
      dueDate: "2026-08-10",
      dueTime: "17:31"
    });
  });

  it("returns no editor target for a non-task line", () => {
    expect(taskAtMarkdownLine("普通正文", 3, file as never)).toBeNull();
  });

  it("registers a shortcut-configurable command and task-only editor context menu", () => {
    expect(mainSource).toContain('id: "edit-current-task"');
    expect(mainSource).toContain('name: t(this.settings.language, "command.editCurrentTask")');
    expect(mainSource).toContain("editorCallback: (editor, view)");
    expect(mainSource).not.toMatch(/id: "edit-current-task"[\s\S]{0,240}hotkeys:/u);
    expect(mainSource).toContain('this.app.workspace.on("editor-menu"');
    expect(mainSource).toContain('setTitle(t(this.settings.language, "taskCalendar.editTask"))');
    expect(mainSource).toContain('new Notice(t(this.settings.language, "notice.currentLineNotTask"))');
  });

  it("uses one shared task editor UI in both the workspace and modal", () => {
    expect(calendarViewSource).toContain("renderTaskCalendarTaskEditor(container");
    expect(modalSource).toContain("renderTaskCalendarTaskEditor(this.contentEl");
    expect(editorUiSource).toContain('taskCalendar.detail.completed');
    expect(editorUiSource).toContain('taskCalendar.detail.syncTarget');
    expect(editorUiSource).toContain('taskCalendar.detail.reminderTime');
    expect(editorUiSource).toContain('taskCalendar.detail.relatedNote');
  });
});
