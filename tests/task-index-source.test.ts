import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");

describe("TaskIndex source integration", () => {
  it("owns a plugin-level task index that updates on markdown file changes", () => {
    expect(mainSource).toContain("import { TaskIndex } from \"./src/taskIndex\"");
    expect(mainSource).toContain("taskIndex!: TaskIndex");
    expect(mainSource).toContain("new TaskIndex(this.app");
    expect(mainSource).toContain("registerTaskIndexInvalidation");
    expect(mainSource).toContain("taskVaultFilterEnabled");
    expect(mainSource).toContain("taskIndexAutoBuild");
    expect(mainSource).toContain("taskIndexDelayOnMobile");
    expect(mainSource).toContain("shouldBuildTaskIndexForLayouts");
    expect(mainSource).toContain('viewLayoutsNeedData(this.currentViewLayouts(), "tasks")');
    const autoBuildBlock = mainSource.slice(mainSource.indexOf("private maybeBuildTaskIndexAfterLoad"), mainSource.indexOf("\n\n}", mainSource.indexOf("private maybeBuildTaskIndexAfterLoad")));
    expect(autoBuildBlock).toContain("this.shouldBuildTaskIndexForLayouts()");
    const invalidationBlock = mainSource.slice(mainSource.indexOf("private registerTaskIndexInvalidation"), mainSource.indexOf("private maybeBuildTaskIndexAfterLoad"));
    expect(invalidationBlock).toContain("this.shouldBuildTaskIndexForLayouts()");
    expect(invalidationBlock).toContain("this.taskIndex.invalidate");
    expect(invalidationBlock.indexOf("this.taskIndex.invalidate")).toBeLessThan(invalidationBlock.indexOf("this.taskIndex.scheduleBuild"));
  });

  it("uses the task index for organizer task counts and cached vault task results", () => {
    const organizerBlock = viewSource.slice(viewSource.indexOf("private renderOrganizerDirectory"), viewSource.indexOf("private renderOrganizerTaskToggle"));
    const taskSourceGuard = viewSource.slice(viewSource.indexOf("private shouldUseTaskIndexForOrganizer"), viewSource.indexOf("private formatTaskIndexCount"));
    const openTaskIndexItemBlock = viewSource.slice(viewSource.indexOf("private async openTaskIndexItem"), viewSource.indexOf("private renderMemoMoreAction"));
    expect(viewSource).toContain("getTaskIndexOrganizerCounts");
    expect(viewSource).toContain("filterTaskIndexItems");
    expect(viewSource).toContain("renderTaskIndexResults");
    expect(viewSource).toContain("this.plugin.taskIndex.getItems()");
    expect(viewSource).toContain("this.plugin.taskIndex.getStatus()");
    expect(openTaskIndexItemBlock).toContain("openFile(file, { state: { line: item.lineNumber - 1 } })");
    expect(openTaskIndexItemBlock).toContain("await this.highlightTaskIndexLine(leaf, file, item)");
    expect(viewSource).toContain("private async highlightTaskIndexLine");
    expect(viewSource).toContain("view.editor.setSelection({ line, ch: 0 }, { line, ch: item.line.length })");
    expect(viewSource).toContain("view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: item.line.length } }, true)");
    expect(taskSourceGuard).toContain("taskVaultFilterEnabled");
    expect(taskSourceGuard).toContain("taskIndexEnabled");
    expect(organizerBlock).not.toContain("vault.read");
    expect(organizerBlock).not.toContain("getMarkdownFiles");
  });

  it("adds task index controls and status to settings without exposing code terms", () => {
    expect(settingsSource).toContain("taskVaultFilterEnabled");
    expect(settingsSource).toContain("taskIndexEnabled");
    expect(settingsSource).toContain("taskIndexAutoBuild");
    expect(settingsSource).toContain("taskIndexDelayOnMobile");
    expect(settingsSource).toContain("settings.taskIndexRebuild");
    expect(settingsSource).toContain("settings.taskIndexClearCache");
    expect(settingsSource).toContain("this.plugin.taskIndex.clearCache()");
    expect(settingsSource).toContain("this.plugin.taskIndex.rebuild({ force: true");
  });
});
