import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");
const mobileLightHomeSource = readFileSync("src/mobileLightHome.ts", "utf8");

describe("mobile light home source integration", () => {
  it("renders a mobile-first light home before the full workbench shell", () => {
    expect(viewSource).toContain("shouldRenderMobileLightHome");
    expect(viewSource).toContain("renderMobileLightHome");
    expect(viewSource).toContain("showFullWorkbench");
    expect(viewSource).toContain('const mobileLayout = this.layoutForSurface("mobile")');
    expect(viewSource).toContain('resolveLayoutSurfaceModules(mobileLayout, "mobile")');

    const renderBlock = viewSource.slice(viewSource.indexOf("async render()"), viewSource.indexOf("private renderSidebar"));
    expect(renderBlock).toContain("this.shouldRenderMobileLightHome()");
    expect(renderBlock.indexOf("this.renderMobileLightHome")).toBeLessThan(renderBlock.indexOf("const activeSurface: DisplaySurface"));
  });

  it("uses mobile layout modules for the mobile workbench, even when the light home is not active", () => {
    const renderBlock = viewSource.slice(viewSource.indexOf("async render()"), viewSource.indexOf("private renderSidebar"));
    const dataNeedsBlock = viewSource.match(/private activeLayoutDataNeeds\(\): Set<DisplayModuleDataNeed> \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";

    expect(renderBlock).toContain('const activeSurface: DisplaySurface = Platform.isMobile ? "mobile" : "home"');
    expect(renderBlock).toContain("const activeLayout = this.layoutForSurface(activeSurface)");
    expect(renderBlock).toContain("const surfaceModules = this.layoutModulesForSurface(activeSurface)");
    expect(renderBlock).toContain("this.shouldRenderDisplaySidebar(surfaceModules)");
    expect(renderBlock).toContain("this.renderMain(shell, activeSurface, activeLayout)");
    expect(dataNeedsBlock).toContain("Platform.isMobile");
    expect(dataNeedsBlock).toContain("this.layoutForSurface(surface)");
  });

  it("only renders the light home shell while mobile performance mode is enabled", () => {
    const shouldRenderBlock = viewSource.match(/private shouldRenderMobileLightHome\(\): boolean \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
    expect(shouldRenderBlock).toContain("this.plugin.settings.mobilePerformanceMode");
    expect(shouldRenderBlock).toContain("this.mobileLayoutMode()");
    expect(shouldRenderBlock).toContain('!== "full"');
  });

  it("renders mobile display modules conditionally instead of using the legacy mobile layout resolver", () => {
    const mobileBlock = viewSource.match(/private async renderMobileLightHome\(shell: Element\): Promise<void> \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
    expect(mobileBlock).toContain('const mobileLayout = this.layoutForSurface("mobile")');
    expect(mobileBlock).toContain('resolveLayoutSurfaceModules(mobileLayout, "mobile")');
    expect(mobileBlock).toContain("renderLayoutSurface({");
    expect(mobileBlock).toContain("COMPOSER_LAYOUT_GROUP");
    expect(mobileBlock).toContain('modules.has("fileList")');
    expect(mobileBlock).toContain("this.shouldRenderDisplaySidebar(modules)");
    expect(mobileBlock).toContain("this.sidebarOptionsForDisplayModules(modules)");
    expect(viewSource).not.toContain("resolveMobileHomeModules");
    expect(viewSource).not.toContain("mobileHomeModules()");
  });

  it("keeps the mobile light home configurable from the unified layout settings", () => {
    expect(settingsSource).toContain("mobileLightHomeEnabled");
    expect(settingsSource).toContain("mobileLightHomeShowLaterButton");
    expect(settingsSource).toContain("mobileLayout");
    expect(settingsSource).toContain('renderViewLayoutSettings(container, "mobile"');
  });

  it("does not render legacy mobile home layout controls in the settings UI", () => {
    const mobileSettingsBlock = settingsSource.match(/private renderMobileLightHomeSettings\(container: HTMLElement\): void \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";

    expect(mobileSettingsBlock).not.toContain("mobileHomeLayout");
    expect(mobileSettingsBlock).not.toContain("mobileHomeCustomModules");
    expect(mobileSettingsBlock).not.toContain("MOBILE_HOME_LAYOUTS");
    expect(mobileSettingsBlock).not.toContain("MOBILE_HOME_MODULES");
  });

  it("keeps legacy mobile layout helpers migration-only", () => {
    expect(mobileLightHomeSource).not.toContain("export function resolveMobileHomeModules");
    expect(mobileLightHomeSource).not.toContain("export const MOBILE_HOME_LAYOUTS");
    expect(mobileLightHomeSource).not.toContain("export const MOBILE_HOME_MODULES");
  });
});
