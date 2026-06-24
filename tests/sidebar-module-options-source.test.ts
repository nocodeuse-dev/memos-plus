import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const displayModulesSource = readFileSync("src/displayModules.ts", "utf8");
const layoutRendererSource = readFileSync("src/layoutRenderer.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");

describe("sidebar display module option helpers", () => {
  it("centralizes directory module detection in the display module registry", () => {
    expect(displayModulesSource).toContain("export function isSidebarDirectoryModule");
    expect(displayModulesSource).toContain("export function hasSidebarDirectoryModules");
    expect(layoutRendererSource).toContain("QUICK_INPUT_DIRECTORY_LAYOUT_GROUP");
    expect(quickInputSource).toContain("QUICK_INPUT_DIRECTORY_LAYOUT_GROUP");
    expect(quickInputSource).not.toContain("function isSidebarDirectoryModule");
  });

  it("uses one sidebar option mapper for desktop home, mobile workbench, and mobile light home", () => {
    const renderBlock = viewSource.slice(viewSource.indexOf("async render()"), viewSource.indexOf("private renderSidebar"));
    const mobileBlock = viewSource.slice(viewSource.indexOf("private async renderMobileLightHome"), viewSource.indexOf("private async renderMobileHomeMemoList"));

    expect(viewSource).toContain("private shouldRenderDisplaySidebar");
    expect(viewSource).toContain("private sidebarOptionsForDisplayModules");
    expect(renderBlock).toContain('const activeSurface: DisplaySurface = Platform.isMobile ? "mobile" : "home"');
    expect(renderBlock).toContain("const surfaceLayoutModules = resolveLayoutSurfaceModules(activeLayout, activeSurface)");
    expect(renderBlock).toContain("const surfaceModules = surfaceLayoutModules.modules");
    expect(renderBlock).toContain("this.shouldRenderDisplaySidebar(surfaceModules)");
    expect(renderBlock).toContain("this.sidebarOptionsForDisplayModules(surfaceLayoutModules.orderedModules)");
    expect(mobileBlock).toContain("this.shouldRenderDisplaySidebar(modules)");
    expect(mobileBlock).toContain("this.sidebarOptionsForDisplayModules(orderedModules)");
  });
});
