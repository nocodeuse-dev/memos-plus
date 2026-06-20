import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const displayModulesSource = readFileSync("src/displayModules.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");

describe("sidebar display module option helpers", () => {
  it("centralizes directory module detection in the display module registry", () => {
    expect(displayModulesSource).toContain("export function isSidebarDirectoryModule");
    expect(displayModulesSource).toContain("export function hasSidebarDirectoryModules");
    expect(quickInputSource).toContain("isSidebarDirectoryModule");
    expect(quickInputSource).not.toContain("function isSidebarDirectoryModule");
  });

  it("uses one sidebar option mapper for desktop home and mobile light home", () => {
    const renderBlock = viewSource.slice(viewSource.indexOf("async render()"), viewSource.indexOf("private renderSidebar"));
    const mobileBlock = viewSource.slice(viewSource.indexOf("private async renderMobileLightHome"), viewSource.indexOf("private async renderMobileHomeMemoList"));

    expect(viewSource).toContain("private shouldRenderDisplaySidebar");
    expect(viewSource).toContain("private sidebarOptionsForDisplayModules");
    expect(renderBlock).toContain("this.shouldRenderDisplaySidebar(homeModules)");
    expect(renderBlock).toContain("this.sidebarOptionsForDisplayModules(homeModules)");
    expect(mobileBlock).toContain("this.shouldRenderDisplaySidebar(modules)");
    expect(mobileBlock).toContain("this.sidebarOptionsForDisplayModules(modules)");
  });
});
