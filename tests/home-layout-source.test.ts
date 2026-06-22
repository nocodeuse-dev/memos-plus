import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("desktop home layout source integration", () => {
  it("renders the desktop home through the unified home display modules", () => {
    expect(viewSource).toContain('from "./layoutRenderer"');
    expect(viewSource).toContain("resolveLayoutSurfaceModules");

    const renderBlock = viewSource.slice(viewSource.indexOf("async render()"), viewSource.indexOf("private renderSidebar"));
    expect(renderBlock).toContain('const activeSurface: DisplaySurface = Platform.isMobile ? "mobile" : "home"');
    expect(renderBlock).toContain("const activeLayout = this.layoutForSurface(activeSurface)");
    expect(renderBlock).toContain("const surfaceModules = this.layoutModulesForSurface(activeSurface)");
    expect(renderBlock).toContain("this.shouldRenderDisplaySidebar(surfaceModules)");
    expect(renderBlock).toContain("this.renderSidebar(shell, this.sidebarOptionsForDisplayModules(surfaceModules))");
    expect(renderBlock).toContain("this.renderMain(shell, activeSurface, activeLayout)");
  });

  it("skips hidden desktop home modules before rendering or binding events", () => {
    const renderMainBlock = viewSource.slice(viewSource.indexOf("private async renderMain"), viewSource.indexOf("private async renderMobileLightHome"));
    const toolbarBlock = viewSource.match(/private renderHomeToolbar\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(renderMainBlock).toContain("renderLayoutSurface({");
    expect(renderMainBlock).toContain("COMPOSER_LAYOUT_GROUP");
    expect(renderMainBlock).toContain("HOME_TOOLBAR_LAYOUT_GROUP");
    expect(renderMainBlock).toContain("HOME_RESULTS_LAYOUT_GROUP");
    expect(renderMainBlock).toContain("this.renderHomeToolbar(header, modules)");
    expect(toolbarBlock).toContain('modules.has("searchBox")');
    expect(toolbarBlock).toContain('modules.has("settingsButton")');
    expect(toolbarBlock).toContain('modules.has("refreshButton")');
    expect(renderMainBlock).toContain('modules.has("quickInput")');
    expect(renderMainBlock).toContain("this.renderHomeResults(main, modules)");
  });

  it("passes the active home/mobile modules into the shared composer so toolbar parts are not preview-only", () => {
    const renderMainBlock = viewSource.slice(viewSource.indexOf("private async renderMain"), viewSource.indexOf("private activeLayoutDataNeeds"));
    const renderComposerBlock = viewSource.slice(viewSource.indexOf("private renderComposer"), viewSource.indexOf("private async renderTimeline(main"));
    const composerSessionSource = readFileSync("src/composerSession.ts", "utf8");
    const composerWidgetSource = readFileSync("src/composerWidget.ts", "utf8");

    expect(renderMainBlock).toContain('this.renderComposer(main, activeSurface === "mobile" ? "mobileHome" : "home", modules)');
    expect(renderComposerBlock).toContain("displayModules: modules");
    expect(composerSessionSource).toContain("displayModules: options.displayModules");
    expect(composerWidgetSource).toContain('this.shouldRenderDisplayModule("inputToolbar")');
    expect(composerWidgetSource).toContain('this.shouldRenderDisplayModule("moreMenu")');
    expect(composerWidgetSource).toContain('this.shouldRenderDisplayModule("sendButton")');
  });
});
