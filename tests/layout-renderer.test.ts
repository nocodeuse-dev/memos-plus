import { describe, expect, it } from "vitest";
import type { ViewLayoutSettings } from "../src/displayModules";
import { renderLayoutSurface, resolveLayoutSurfaceModules } from "../src/layoutRenderer";

describe("layout surface renderer", () => {
  it("resolves one ordered module set for a surface", () => {
    const layout: ViewLayoutSettings = {
      mode: "custom",
      visibleModules: ["fileList", "quickInput", "taskDirectory"],
      order: ["taskDirectory", "quickInput", "fileList"],
      compactMode: false
    };

    const result = resolveLayoutSurfaceModules(layout, "home");

    expect(result.orderedModules).toEqual(["taskDirectory", "quickInput", "fileList"]);
    expect([...result.modules]).toEqual(["taskDirectory", "quickInput", "fileList"]);
  });

  it("renders modules in layout order with the shared module set", async () => {
    const layout: ViewLayoutSettings = {
      mode: "custom",
      visibleModules: ["fileList", "quickInput", "taskDirectory"],
      order: ["taskDirectory", "quickInput", "fileList"],
      compactMode: false
    };
    const seen: string[] = [];

    await renderLayoutSurface({
      surface: "home",
      layout,
      renderModule: ({ moduleId, modules }) => {
        seen.push(`${moduleId}:${modules.has("fileList")}`);
      }
    });

    expect(seen).toEqual(["taskDirectory:true", "quickInput:true", "fileList:true"]);
  });

  it("can collapse related modules into a single surface group render", async () => {
    const layout: ViewLayoutSettings = {
      mode: "custom",
      visibleModules: ["projectDirectory", "tagFilters", "fileList"],
      order: ["tagFilters", "projectDirectory", "fileList"],
      compactMode: false
    };
    const seen: string[] = [];

    await renderLayoutSurface({
      surface: "sidebar",
      layout,
      groups: {
        directory: ["allNotes", "projectDirectory", "projectFilters", "organizeDirectory", "taskDirectory", "tagFilters"]
      },
      renderGroup: ({ groupId, triggerModuleId, modules }) => {
        seen.push(`${groupId}:${triggerModuleId}:${modules.has("projectDirectory")}`);
      },
      renderModule: ({ moduleId }) => {
        seen.push(moduleId);
      }
    });

    expect(seen).toEqual(["directory:tagFilters:true", "fileList"]);
  });
});
