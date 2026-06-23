import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composerWidgetSource = readFileSync("src/composerWidget.ts", "utf8");
const composerActionsSource = readFileSync("src/composerActions.ts", "utf8");
const projectModalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

function functionBody(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  return start === -1 || end === -1 ? "" : source.slice(start, end);
}

describe("task settings prompt wiring", () => {
  it("routes composer task actions through the task prompt instead of direct marker insertion", () => {
    expect(composerWidgetSource).toContain("formatTaskContent");
    expect(composerWidgetSource).toContain("applyTaskTool");
    expect(composerWidgetSource).toContain('id: "task"');
    expect(composerWidgetSource).not.toContain('id: "task", icon: "square-check", labelKey: "toolbar.insertTask", onClick: () => this.applyTextTool("task")');
  });

  it("does not prompt when default sending saves a normal memo", () => {
    const saveDefaultSource = functionBody(composerActionsSource, "const saveDefault = async", "const sendToProject = async");
    expect(saveDefaultSource).not.toContain("taskPromptOnCreate");
    expect(saveDefaultSource).not.toContain("openTaskOptionsModal");
    expect(saveDefaultSource).not.toContain("renderTaskContentWithOptions");
    expect(saveDefaultSource).toContain("prepareCalloutContent");
    expect(saveDefaultSource).toContain("host.store.addMemo");
  });

  it("does not prompt for format-rule task sends", () => {
    expect(projectModalSource).toContain("promptOnCreate");
    expect(projectModalSource).not.toContain('decision === "task" && this.options.taskSettings.promptOnCreate');
  });

  it("shows a localized setting for task prompt behavior", () => {
    expect(settingsSource).toContain("settings.taskPromptOnCreate");
    expect(i18nSource).toContain('"settings.taskPromptOnCreate": "添加任务时弹出任务设置"');
    expect(i18nSource).toContain("不影响默认发送");
  });
});
