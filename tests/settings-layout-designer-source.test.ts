import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync("src/settings.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");
const styles = readFileSync("styles.css", "utf8");

describe("visual layout settings source", () => {
  it("renders the layout page as an interactive designer instead of layout cards", () => {
    const layoutSource = settingsSource.slice(settingsSource.indexOf("private renderLayoutSettings"), settingsSource.indexOf("private renderDesktopHomeLayoutSettings"));

    expect(settingsSource).toContain("private selectedLayoutSurface: DisplaySurface = \"home\"");
    expect(settingsSource).toContain("private selectedLayoutModuleId");
    expect(layoutSource).toContain("this.renderLayoutSurfaceSwitcher");
    expect(layoutSource).toContain("this.renderLayoutVisualWorkspace");
    expect(layoutSource).not.toContain("LAYOUT_CENTER_CARDS");
    expect(settingsSource).toContain("renderLayoutPreview");
    expect(settingsSource).toContain("renderHomeLayoutMockup");
    expect(settingsSource).toContain("renderSidebarLayoutMockup");
    expect(settingsSource).toContain("renderMobileLayoutMockup");
    expect(settingsSource).toContain("renderLayoutPreviewRegion");
    expect(settingsSource).toContain("renderLayoutModuleInspector");
    expect(settingsSource).not.toContain("renderLayoutModuleButton");
  });

  it("uses realistic surface mockups instead of long gray module description rows", () => {
    const previewSource = settingsSource.slice(settingsSource.indexOf("private renderLayoutPreview"), settingsSource.indexOf("private selectLayoutModule"));

    expect(settingsSource).toContain("memos-plus-layout-mockup");
    expect(settingsSource).toContain("memos-plus-layout-sidebar-card");
    expect(settingsSource).toContain("memos-plus-layout-phone-frame");
    expect(settingsSource).toContain("memos-plus-layout-home-shell");
    expect(settingsSource).toContain("memos-plus-layout-region-label");
    expect(previewSource).not.toContain("memos-plus-layout-preview-module-desc");
    expect(previewSource).not.toContain("module.description");
  });

  it("updates only the preview and inspector when a preview module is selected", () => {
    expect(settingsSource).toContain("selectLayoutModule");
    expect(settingsSource).toContain("preview.empty()");
    expect(settingsSource).toContain("inspector.empty()");
    expect(settingsSource).not.toContain("selectLayoutModule(surface, module.id);\\n      this.display()");
  });

  it("keeps module settings shared while exposing focused panels for task directory and quick input", () => {
    const inspectorSource = settingsSource.slice(settingsSource.indexOf("private renderLayoutModuleInspector"), settingsSource.indexOf("private renderLayoutGenericInspector"));

    expect(inspectorSource).toContain("case \"taskDirectory\"");
    expect(inspectorSource).toContain("this.renderLayoutTaskDirectoryInspector");
    expect(settingsSource).toContain("settings.organizerTaskPriorityBranchesEnabled");
    expect(settingsSource).toContain("settings.organizerTaskDateBranchesEnabled");
    expect(settingsSource).toContain("settings.organizerTasksDefaultExpanded");
    expect(settingsSource).toContain("settings.taskVaultFilterEnabled");

    expect(inspectorSource).toContain("case \"quickInput\"");
    expect(inspectorSource).toContain("this.renderLayoutQuickInputInspector");
    expect(settingsSource).toContain("settings.defaultSendAction");
    expect(settingsSource).toContain("settings.quickInputDefaultSendAction");
    expect(settingsSource).toContain("\"inputToolbar\"");
    expect(settingsSource).toContain("\"sendButton\"");
  });

  it("exposes move up and move down controls for the selected layout module", () => {
    const actionsSource = settingsSource.slice(settingsSource.indexOf("private renderLayoutInspectorActions"), settingsSource.indexOf("private fullSettingsTabForModule"));

    expect(settingsSource).toContain("moveLayoutModule");
    expect(actionsSource).toContain("settings.layoutDesigner.moveUp");
    expect(actionsSource).toContain("settings.layoutDesigner.moveDown");
    expect(actionsSource).toContain("this.moveLayoutModule(surface, module.id, -1");
    expect(actionsSource).toContain("this.moveLayoutModule(surface, module.id, 1");
    expect(i18nSource).toContain('"settings.layoutDesigner.moveUp": "上移"');
    expect(i18nSource).toContain('"settings.layoutDesigner.moveDown": "下移"');
  });

  it("persists layout changes through a refresh path that updates real views, not only the preview", () => {
    const setViewLayoutSource = settingsSource.slice(settingsSource.indexOf("private async setViewLayout"), settingsSource.indexOf("private renderMobileLightHomeSettings"));
    const syncSource = settingsSource.slice(settingsSource.indexOf("private renderDisplayContentSyncSettings"), settingsSource.indexOf("private renderViewLayoutSettings"));

    expect(setViewLayoutSource).toContain('this.plugin.refreshLayoutViews("layout-settings")');
    expect(syncSource).toContain('this.plugin.refreshLayoutViews("layout-settings")');
    expect(syncSource).not.toContain("await this.plugin.persistSettings();\n          this.display();");
  });

  it("adds Chinese labels and responsive designer styles", () => {
    for (const key of [
      "settings.layoutDesigner.surface.home",
      "settings.layoutDesigner.surface.sidebar",
      "settings.layoutDesigner.surface.mobile",
      "settings.layoutDesigner.preview",
      "settings.layoutDesigner.inspector",
      "settings.layoutDesigner.hideRegion",
      "settings.layoutDesigner.restoreDefault",
      "settings.layoutDesigner.openFullSettings"
    ]) {
      expect(i18nSource).toContain(key);
    }

    expect(styles).toContain(".memos-plus-layout-designer");
    expect(styles).toContain(".memos-plus-layout-region.is-selected");
    expect(styles).toContain(".memos-plus-layout-region.is-hidden");
    expect(styles).toContain(".memos-plus-layout-mockup");
    expect(styles).toContain(".memos-plus-layout-sidebar-card");
    expect(styles).toContain(".memos-plus-layout-phone-frame");
    expect(styles).toContain(".memos-plus-layout-home-shell");
    expect(styles).toContain(".memos-plus-layout-inspector");
    expect(styles).toContain("@media (max-width: 720px)");
  });
});
