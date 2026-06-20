import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("desktop home layout source integration", () => {
  it("renders the desktop home through the unified home display modules", () => {
    expect(viewSource).toContain('resolveViewLayoutModules(this.plugin.settings.homeLayout, "home")');
    expect(viewSource).toContain("const homeModules = this.homeLayoutModules()");

    const renderBlock = viewSource.slice(viewSource.indexOf("async render()"), viewSource.indexOf("private renderSidebar"));
    expect(renderBlock).toContain("const homeModules = this.homeLayoutModules()");
    expect(renderBlock).toContain("this.shouldRenderDisplaySidebar(homeModules)");
    expect(renderBlock).toContain("this.renderSidebar(shell, this.sidebarOptionsForDisplayModules(homeModules))");
    expect(renderBlock).toContain("this.renderMain(shell, homeModules)");
  });

  it("skips hidden desktop home modules before rendering or binding events", () => {
    const renderMainBlock = viewSource.slice(viewSource.indexOf("private async renderMain"), viewSource.indexOf("private async renderMobileLightHome"));
    const toolbarBlock = viewSource.match(/private renderHomeToolbar\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(renderMainBlock).toContain("this.renderHomeToolbar(header, modules)");
    expect(toolbarBlock).toContain('modules.has("searchBox")');
    expect(toolbarBlock).toContain('modules.has("settingsButton")');
    expect(toolbarBlock).toContain('modules.has("refreshButton")');
    expect(renderMainBlock).toContain('modules.has("quickInput")');
    expect(renderMainBlock).toContain("this.renderHomeResults(main, modules)");
  });
});
