import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");

describe("organizer panel source integration", () => {
  it("moves organizer entries into the sidebar instead of rendering a main panel", () => {
    const allSectionIndex = viewSource.indexOf("memos-plus-sidebar-all-section");
    const organizerDirectoryIndex = viewSource.indexOf("this.renderOrganizerDirectory(sidebar, {");
    const customDirectoryIndex = viewSource.indexOf("this.renderCustomDirectory(sidebar);");

    expect(viewSource).not.toContain("this.renderOrganizerPanel(main);");
    expect(viewSource).not.toContain("private renderOrganizerPanel");
    expect(viewSource).not.toContain("private renderOrganizerSection");
    expect(allSectionIndex).toBeGreaterThanOrEqual(0);
    expect(organizerDirectoryIndex).toBeGreaterThan(allSectionIndex);
    expect(customDirectoryIndex).toBeGreaterThan(organizerDirectoryIndex);
  });

  it("keeps organizer directory counts local to loaded memos and does not trigger vault reads", () => {
    const organizerBlock = viewSource.slice(viewSource.indexOf("private renderOrganizerDirectory"), viewSource.indexOf("private renderCustomDirectory"));

    expect(viewSource).toContain("buildOrganizerPanelSections");
    expect(viewSource).toContain("buildOrganizerTaskBranchSections");
    expect(viewSource).toContain("filterMemosForOrganizerFilter");
    expect(viewSource).toContain("this.activeOrganizerSection()");
    expect(viewSource).toContain("selectOrganizerSection");
    expect(viewSource).toContain("organizerTasksExpanded");
    expect(organizerBlock).not.toContain("vault.read");
    expect(organizerBlock).not.toContain("getMarkdownFiles");
  });

  it("adds organizer directory controls to the display settings tab without height controls", () => {
    const settingsBlock = settingsSource.slice(settingsSource.indexOf("private renderOrganizerDirectorySettings"), settingsSource.indexOf("private renderAdvancedSettings"));
    expect(settingsSource).toContain("renderOrganizerDirectorySettings");
    expect(settingsSource).toContain("settings.organizerPanel");
    expect(settingsSource).toContain("organizerPanelSections");
    expect(settingsSource).toContain("organizerTaskPriorityBranchesEnabled");
    expect(settingsSource).toContain("organizerTaskDateBranchesEnabled");
    expect(settingsSource).toContain("organizerTasksDefaultExpanded");
    expect(settingsBlock).toContain("settings.taskManagementVisibleItems");
    expect(settingsBlock).toContain("TASK_MANAGEMENT_VISIBLE_ITEM_DEFINITIONS");
    expect(settingsBlock).toContain("normalizeTaskManagementVisibleItems");
    expect(settingsBlock).toContain("this.persistLayoutAffectingSetting()");
    expect(settingsBlock).not.toContain("organizerPanelDesktopHeight");
    expect(settingsBlock).not.toContain("organizerPanelMobileHeight");
  });

  it("passes task management visible items into the real sidebar rendering path", () => {
    const organizerBlock = viewSource.slice(viewSource.indexOf("private renderOrganizerDirectory"), viewSource.indexOf("private renderOrganizerTaskToggle"));

    expect(organizerBlock).toContain("taskManagementVisibleItems: settings.taskManagementVisibleItems");
    expect(organizerBlock).toContain("visibleItems: settings.taskManagementVisibleItems");
  });
});
