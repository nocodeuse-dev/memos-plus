import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");

describe("layout renderer source integration", () => {
  it("routes desktop and mobile home rendering through the shared layout renderer", () => {
    expect(viewSource).toContain('from "./layoutRenderer"');
    expect(viewSource).toContain("renderLayoutSurface({");
    expect(viewSource).toContain("resolveLayoutSurfaceModules(");
    expect(viewSource).toContain("surface: activeSurface");
  });

  it("routes sidebar quick input ordering through the shared layout renderer", () => {
    expect(quickInputSource).toContain('from "./layoutRenderer"');
    expect(quickInputSource).toContain("renderLayoutSurface({");
    expect(quickInputSource).toContain('surface: "sidebar"');
    expect(quickInputSource).not.toContain('for (const moduleId of resolveViewLayoutModules(this.plugin.settings.sidebarLayout, "sidebar"))');
  });

  it("keeps settings visibility checks on the same layout resolver used by real UI", () => {
    expect(settingsSource).toContain('from "./layoutRenderer"');
    expect(settingsSource).toContain("resolveLayoutSurfaceModules(this.getViewLayout(surface), surface)");
  });
});
