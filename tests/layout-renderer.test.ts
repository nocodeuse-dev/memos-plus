import { describe, expect, it } from "vitest";
import {
  COMPOSER_LAYOUT_GROUP,
  HOME_RESULTS_LAYOUT_GROUP,
  HOME_TOOLBAR_LAYOUT_GROUP,
  SIDEBAR_NAVIGATION_LAYOUT_GROUP,
  orderedLayoutRegions
} from "../src/layoutRenderer";
import type { DisplayModuleId } from "../src/displayModules";

describe("layout renderer ordering helpers", () => {
  it("groups modules by their real visual regions while preserving layout order inside each region", () => {
    const orderedModules: DisplayModuleId[] = [
      "projectDirectory",
      "statsCards",
      "taskDirectory",
      "quickInput",
      "allNotes",
      "fileCount",
      "organizeDirectory",
      "inputToolbar",
      "fileList"
    ];

    const regions = orderedLayoutRegions(orderedModules, {
      toolbar: HOME_TOOLBAR_LAYOUT_GROUP,
      composer: COMPOSER_LAYOUT_GROUP,
      sidebar: [...SIDEBAR_NAVIGATION_LAYOUT_GROUP, "statsCards", "heatmap"],
      results: HOME_RESULTS_LAYOUT_GROUP
    });

    expect(regions.map((region) => region.regionId)).toEqual(["sidebar", "composer", "results"]);
    expect(regions.find((region) => region.regionId === "sidebar")?.moduleIds).toEqual([
      "projectDirectory",
      "statsCards",
      "taskDirectory",
      "allNotes",
      "organizeDirectory"
    ]);
    expect(regions.find((region) => region.regionId === "composer")?.moduleIds).toEqual(["quickInput", "inputToolbar"]);
    expect(regions.find((region) => region.regionId === "results")?.moduleIds).toEqual(["fileCount", "fileList"]);
  });

  it("returns ungrouped modules as their own ordered regions", () => {
    const regions = orderedLayoutRegions(["settingsButton", "refreshButton", "quickInput"], {
      composer: COMPOSER_LAYOUT_GROUP
    });

    expect(regions).toMatchObject([
      { regionId: "settingsButton", moduleIds: ["settingsButton"], grouped: false },
      { regionId: "refreshButton", moduleIds: ["refreshButton"], grouped: false },
      { regionId: "composer", moduleIds: ["quickInput"], grouped: true }
    ]);
  });
});
