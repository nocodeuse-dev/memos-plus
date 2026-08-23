import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_CALENDAR_SETTINGS, normalizeTaskCalendarSettings } from "../src/taskCalendar";

const homeView = readFileSync("src/view.ts", "utf8");
const taskSurface = readFileSync("src/taskCalendarView.ts", "utf8");
const main = readFileSync("main.ts", "utf8");
const styles = readFileSync("styles.css", "utf8");

describe("unified workbench sidebar", () => {
  it("uses one long-lived shell with a single sidebar and swaps only the content surface", () => {
    expect(homeView).toContain('"memos-plus-shell memos-plus-unified-shell"');
    expect(homeView).toContain('"memos-plus-sidebar memos-plus-unified-sidebar"');
    expect(homeView).toContain('"memos-plus-main memos-plus-unified-content"');
    expect(homeView).toContain("new TaskCalendarSurface(this.plugin, main");
    expect(homeView).toContain("this.taskCalendarSurface?.renderSidebarExtras(sidebar)");
    expect(taskSurface).toContain("export class TaskCalendarSurface");
    expect(taskSurface).toContain("renderSidebarExtras(container: HTMLElement)");
    expect(taskSurface).not.toContain('createDiv({ cls: "memos-plus-task-calendar-navigation"');
  });

  it("keeps the old task-calendar view only as a migration route", () => {
    expect(taskSurface).toContain("export class TaskCalendarView extends ItemView");
    expect(taskSurface).toContain("await this.plugin.openTaskCalendar(undefined, this.leaf)");
    expect(main).toContain("return this.activateView(preferredLeaf)");
    expect(main).toContain("leaf.view.openTaskWorkbench(options ?? {})");
    expect(main).not.toContain("getLeavesOfType(MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE)[0]");
  });

  it("persists sidebar width, collapse state and scroll position", () => {
    expect(DEFAULT_TASK_CALENDAR_SETTINGS.sidebarScrollTop).toBe(0);
    expect(normalizeTaskCalendarSettings({ sidebarScrollTop: 123.8 }).sidebarScrollTop).toBe(124);
    expect(homeView).toContain("sidebarScrollTop");
    expect(homeView).toContain("navigationWidth");
    expect(homeView).toContain("is-unified-sidebar-collapsed");
    expect(styles).toContain(".memos-plus-unified-sidebar-resizer");
    expect(styles).toContain(".memos-plus-unified-shell.is-unified-sidebar-collapsed");
  });
});
