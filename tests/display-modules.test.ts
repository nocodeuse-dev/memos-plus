import { describe, expect, it } from "vitest";
import {
  DISPLAY_MODULE_IDS,
  DISPLAY_SURFACES,
  DEFAULT_VIEW_LAYOUTS,
  copyViewLayoutToSurface,
  getDisplayModule,
  modulesForSurface,
  normalizeViewLayout,
  normalizeViewLayouts,
  resolveViewLayoutDataNeeds,
  resolveViewLayoutModules,
  viewLayoutsNeedData
} from "../src/displayModules";

describe("display module registry", () => {
  it("registers the shared modules for home, sidebar, and mobile surfaces", () => {
    expect(DISPLAY_SURFACES).toEqual(["home", "sidebar", "mobile"]);
    expect(DISPLAY_MODULE_IDS).toEqual([
      "quickInput",
      "inputToolbar",
      "sendButton",
      "searchBox",
      "allNotes",
      "projectDirectory",
      "projectFilters",
      "organizeDirectory",
      "taskDirectory",
      "tagFilters",
      "fileCount",
      "fileList",
      "heatmap",
      "statsCards",
      "settingsButton",
      "refreshButton",
      "moreMenu"
    ]);

    const quickInput = getDisplayModule("quickInput");
    expect(quickInput?.name).toBe("快速输入框");
    expect(quickInput?.supportedSurfaces).toEqual(["home", "sidebar", "mobile"]);
    expect(quickInput?.performanceCost).toBe("low");

    expect(modulesForSurface("sidebar").map((module) => module.id)).toContain("projectDirectory");
    expect(modulesForSurface("sidebar").map((module) => module.id)).not.toContain("heatmap");
  });

  it("normalizes per-surface layout settings and filters unsupported modules", () => {
    const layout = normalizeViewLayout(
      {
        mode: "custom",
        visibleModules: ["quickInput", "heatmap", "not-real", "quickInput"],
        order: ["projectDirectory", "quickInput", "heatmap"],
        compactMode: false
      },
      "sidebar"
    );

    expect(layout).toEqual({
      mode: "custom",
      visibleModules: ["quickInput"],
      order: ["quickInput"],
      compactMode: false
    });
  });

  it("resolves presets from the same module registry", () => {
    expect(resolveViewLayoutModules({ mode: "minimal", visibleModules: [], order: [], compactMode: false }, "home")).toEqual(["quickInput", "sendButton", "moreMenu"]);
    expect(resolveViewLayoutModules({ mode: "project", visibleModules: [], order: [], compactMode: false }, "home")).toEqual([
      "projectDirectory",
      "projectFilters",
      "fileCount",
      "fileList",
      "settingsButton",
      "refreshButton"
    ]);
    expect(resolveViewLayoutModules({ mode: "full", visibleModules: [], order: [], compactMode: true }, "sidebar")).not.toContain("heatmap");
    expect(
      resolveViewLayoutModules(
        {
          mode: "custom",
          visibleModules: ["fileList", "quickInput", "projectDirectory"],
          order: ["projectDirectory", "quickInput", "fileList"],
          compactMode: true
        },
        "sidebar"
      )
    ).toEqual(["projectDirectory", "quickInput", "fileList"]);
  });

  it("derives data needs from visible modules", () => {
    expect(resolveViewLayoutDataNeeds({ mode: "minimal", visibleModules: [], order: [], compactMode: false }, "home")).toEqual([]);
    expect(resolveViewLayoutDataNeeds({ mode: "quick-input", visibleModules: [], order: [], compactMode: true }, "sidebar")).toEqual([]);
    expect(resolveViewLayoutDataNeeds({ mode: "project", visibleModules: [], order: [], compactMode: false }, "home")).toEqual(["sidebar", "memos", "vaultIndex"]);
    expect(
      resolveViewLayoutDataNeeds(
        {
          mode: "custom",
          visibleModules: ["quickInput", "statsCards"],
          order: [],
          compactMode: false
        },
        "home"
      )
    ).toEqual(["memos", "stats"]);
    expect(
      resolveViewLayoutDataNeeds(
        {
          mode: "custom",
          visibleModules: ["quickInput", "taskDirectory"],
          order: [],
          compactMode: false
        },
        "home"
      )
    ).toEqual(["tasks"]);
    expect(
      resolveViewLayoutDataNeeds(
        {
          mode: "custom",
          visibleModules: ["projectDirectory", "projectFilters", "tagFilters"],
          order: [],
          compactMode: false
        },
        "home"
      )
    ).toEqual(["sidebar", "memos", "vaultIndex"]);
  });

  it("checks whether any surface layout needs a data source", () => {
    const layouts = normalizeViewLayouts({
      home: { mode: "custom", visibleModules: ["quickInput"] },
      sidebar: { mode: "custom", visibleModules: ["quickInput"] },
      mobile: { mode: "custom", visibleModules: ["quickInput"] }
    });
    expect(viewLayoutsNeedData(layouts, "memos")).toBe(false);
    expect(viewLayoutsNeedData(layouts, "tasks")).toBe(false);

    const taskLayouts = normalizeViewLayouts({
      ...layouts,
      mobile: { mode: "custom", visibleModules: ["taskDirectory"] }
    });
    expect(viewLayoutsNeedData(taskLayouts, "tasks")).toBe(true);
  });

  it("normalizes all three layouts and copies shared configuration safely", () => {
    const layouts = normalizeViewLayouts({
      home: { mode: "project" },
      sidebar: { mode: "navigation" },
      mobile: { mode: "custom", visibleModules: ["quickInput", "heatmap", "fileList"] }
    });

    expect(layouts.home.mode).toBe("project");
    expect(layouts.sidebar.mode).toBe("navigation");
    expect(layouts.sidebar.compactMode).toBe(true);
    expect(layouts.mobile.visibleModules).toEqual(["quickInput", "heatmap", "fileList"]);
    expect(layouts.mobile.order).toEqual(["quickInput", "heatmap", "fileList"]);
    expect(DEFAULT_VIEW_LAYOUTS.mobile.mode).toBe("navigation");

    const copied = copyViewLayoutToSurface(
      { mode: "custom", visibleModules: ["quickInput", "heatmap", "fileList"], order: ["fileList", "quickInput", "heatmap"], compactMode: false },
      "sidebar"
    );
    expect(copied.mode).toBe("custom");
    expect(copied.visibleModules).toEqual(["quickInput", "fileList"]);
    expect(copied.order).toEqual(["fileList", "quickInput"]);
    expect(copied.compactMode).toBe(false);
  });
});
