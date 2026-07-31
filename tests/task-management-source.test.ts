import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const modalSource = readFileSync("src/taskManagementModal.ts", "utf8");
const actionsSource = readFileSync("src/taskActions.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");

describe("task management floating entry source integration", () => {
  it("renders a bottom-right task manager entry on both desktop and mobile layouts", () => {
    expect(viewSource).toContain("renderFloatingActions(shell)");
    expect(viewSource).toContain('"memos-plus-task-manager-fab"');
    expect(viewSource).toContain('"list-todo"');
    expect(stylesSource).toContain(".memos-plus-floating-actions {");
    expect(stylesSource).toContain("right: 20px;");
    expect(stylesSource).toContain("bottom: 20px;");
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
