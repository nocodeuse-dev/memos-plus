import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { taskAtMarkdownLine } from "../src/currentTaskEditor";
import { taskMetadataRangesForLine } from "../src/taskMetadataRanges";
import { normalizeTaskCheckboxCompletion, taskCheckboxCompletionTransition } from "../src/taskCheckboxCompletion";

const mainSource = readFileSync("main.ts", "utf8");
const modalSource = readFileSync("src/taskCalendarTaskEditorModal.ts", "utf8");
const editorUiSource = readFileSync("src/taskCalendarTaskEditorUi.ts", "utf8");
const calendarViewSource = readFileSync("src/taskCalendarView.ts", "utf8");
const metadataEditorSource = readFileSync("src/taskMetadataEditor.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");

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

  it("recognizes visible task detail tokens while leaving ordinary body text alone", () => {
    const line = "- [ ] 复诊内容 📅 2026-08-21 ⏰ 17:00 🔔 30分钟 🔼 #项目/门诊";
    const ranges = taskMetadataRangesForLine(line).map((range) => line.slice(range.from, range.to));
    expect(ranges).toEqual(expect.arrayContaining(["📅 2026-08-21", "⏰ 17:00", "🔔 30分钟", "🔼", "#项目/门诊"]));
    expect(taskMetadataRangesForLine("普通正文 #标签")).toEqual([]);
  });

  it("recognizes native Markdown checkbox completion and reopening without guessing timestamps", () => {
    expect(taskCheckboxCompletionTransition("- [ ] 复诊 📅 2026-08-21", "- [x] 复诊 📅 2026-08-21")).toBe("completed");
    expect(taskCheckboxCompletionTransition("- [x] 复诊 ✅ 2026-08-21", "- [ ] 复诊 ✅ 2026-08-21")).toBe("reopened");
    expect(taskCheckboxCompletionTransition("- [x] 已完成", "- [x] 已完成")).toBeNull();
    expect(taskCheckboxCompletionTransition("普通正文", "普通正文")).toBeNull();
  });

  it("writes an exact local completion timestamp after a native checkbox click and clears it on reopen", () => {
    const completed = normalizeTaskCheckboxCompletion(
      "- [ ] 复诊 📅 2026-08-21",
      "- [x] 复诊 📅 2026-08-21",
      new Date(2026, 7, 20, 21, 28, 45)
    );
    expect(completed).toContain("✅ 2026-08-20");
    expect(completed).toContain("completedAt%22%3A%222026-08-20T21%3A28%3A45");
    const reopened = normalizeTaskCheckboxCompletion(completed, completed.replace("[x]", "[ ]"));
    expect(reopened).not.toContain("✅ 2026-08-20");
    expect(reopened).not.toContain("completedAt");
  });

  it("registers a shortcut-configurable command and task-only editor context menu", () => {
    expect(mainSource).toContain('id: "edit-current-task"');
    expect(mainSource).toContain('name: t(this.settings.language, "command.editCurrentTask")');
    expect(mainSource).toContain("editorCallback: (editor, view)");
    expect(mainSource).not.toMatch(/id: "edit-current-task"[\s\S]{0,240}hotkeys:/u);
    expect(mainSource).toContain('this.app.workspace.on("editor-menu"');
    expect(mainSource).toContain('setTitle(t(this.settings.language, "taskCalendar.editTask"))');
    expect(mainSource).toContain('new Notice(t(this.settings.language, "notice.currentLineNotTask"))');
    expect(mainSource).toContain("this.registerEditorExtension(createTaskMetadataEditorExtension(this))");
    expect(metadataEditorSource).toContain("nativeLinkOrTagTarget");
    expect(metadataEditorSource).toContain("hadSelection");
    expect(metadataEditorSource).toContain("openTaskCalendarTaskEditor(task)");
    expect(metadataEditorSource).toContain("captureCheckboxTransitions(update)");
    expect(metadataEditorSource).toContain("normalizeTaskCheckboxCompletion(entry.beforeLine, line.text)");
    expect(stylesSource).toContain(".memos-plus-task-editor-metadata:hover");
    expect(stylesSource).toContain(".memos-plus-task-editor-inline-hint");
  });

  it("uses one shared task editor UI in both the workspace and modal", () => {
    expect(calendarViewSource).toContain("renderTaskCalendarTaskEditor(container");
    expect(modalSource).toContain("renderTaskCalendarTaskEditor(this.contentEl");
    expect(editorUiSource).toContain('taskCalendar.detail.completed');
    expect(editorUiSource).toContain('taskCalendar.detail.syncTarget');
    expect(editorUiSource).toContain('taskCalendar.detail.reminderTime');
    expect(editorUiSource).toContain('taskCalendar.detail.relatedNote');
    expect(stylesSource).toContain(".modal-container:has(.memos-plus-task-editor-modal) .modal");
    expect(stylesSource).toContain(".memos-plus-task-editor-modal .memos-plus-task-calendar-task-detail-grid");
  });
});
