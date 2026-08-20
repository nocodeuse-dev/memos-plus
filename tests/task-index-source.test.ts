import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const taskCalendarViewSource = readFileSync("src/taskCalendarView.ts", "utf8");
const taskNavigationSource = readFileSync("src/taskNavigation.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");
const appleSyncServiceSource = readFileSync("src/appleSyncService.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");

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
    expect(invalidationBlock).toContain("this.taskIndex.updateFile(file)");
    expect(invalidationBlock).toContain("this.taskIndex.removeFile(file.path)");
    expect(invalidationBlock).toContain("this.taskIndex.invalidate");
    expect(invalidationBlock).toContain("scheduleInitialBuild()");
  });

  it("reuses the ready task index during Apple sync instead of rebuilding the whole vault", () => {
    expect(appleSyncServiceSource).toContain("this.options.taskIndex.refreshChangedFiles()");
    expect(appleSyncServiceSource).not.toContain("this.options.taskIndex.rebuild()");
  });

  it("uses the task index for organizer counts and routes task results into the unified workspace", () => {
    const organizerBlock = viewSource.slice(viewSource.indexOf("private renderOrganizerDirectory"), viewSource.indexOf("private renderOrganizerTaskToggle"));
    expect(viewSource).toContain("getTaskIndexOrganizerCounts");
    expect(viewSource).toContain("this.plugin.openTaskCalendarFromOrganizer(id, this.leaf)");
    expect(viewSource).not.toContain("renderTaskIndexResults");
    expect(viewSource).toContain("this.plugin.taskIndex.getStatus()");
    expect(taskCalendarViewSource).toContain("this.plugin.taskIndex.getItems()");
    expect(taskCalendarViewSource).toContain("this.plugin.openTaskCalendarTask(task)");
    expect(taskNavigationSource).toContain("openFile(file, { state: { line: item.lineNumber - 1 } })");
    expect(taskNavigationSource).toContain("view.editor.setSelection({ line, ch: 0 }, { line, ch: item.line.length })");
    expect(taskNavigationSource).toContain("view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: item.line.length } }, true)");
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

  it("assigns stable palette colors to tags in result cards", () => {
    expect(viewSource).toContain('chip.setAttr("data-tag-color", String(tagColorSlot(tag)))');
    expect(stylesSource).toContain('.memos-plus-tag-chip[data-tag-color="0"]');
    expect(stylesSource).toContain('.theme-dark .memos-plus-tag-chip[data-tag-color="7"]');
  });
});
