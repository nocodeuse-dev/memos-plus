import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const modalSource = readFileSync("src/taskManagementModal.ts", "utf8");
const actionsSource = readFileSync("src/taskActions.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");

describe("task management floating entry source integration", () => {
  it("renders the task manager entry in Obsidian's bottom status bar", () => {
    expect(mainSource).toContain("this.addStatusBarItem()");
    expect(mainSource).toContain('"memos-plus-task-status-item"');
    expect(mainSource).toContain('setIcon(item, "list-todo")');
    expect(stylesSource).toContain(".status-bar-item.memos-plus-task-status-item");
    expect(viewSource).not.toContain("memos-plus-task-manager-fab");
    expect(viewSource).not.toContain("renderFloatingActions");
  });

  it("uses the existing task index with bounded rendering and mobile modal cleanup", () => {
    expect(modalSource).toContain("options.taskIndex.getItems()");
    expect(modalSource).toContain("filtered.slice(0, this.visibleCount)");
    expect(modalSource).toContain('status.cacheState === "needs-update"');
    expect(modalSource).toContain("registerMemosPlusModalOpen(this, \"TaskManagementModal\")");
    expect(modalSource).toContain("registerMemosPlusModalClose(this, \"TaskManagementModal\")");
    expect(modalSource).toContain("this.unsubscribe?.()");
  });

  it("delegates recurrence-aware toggles and edits to the official Tasks API when available", () => {
    expect(actionsSource).toContain('plugins?.["obsidian-tasks-plugin"]?.apiV1');
    expect(actionsSource).toContain("executeToggleTaskDoneCommand(task.line, task.filePath)");
    expect(actionsSource).toContain("editTaskLineModal(task.line)");
    expect(actionsSource).toContain("replaceIndexedTaskLine");
  });
});
