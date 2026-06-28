import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync("src/settings.ts", "utf8");

describe("settings UI source", () => {
  it("does not expose the old link capture project editor", () => {
    expect(settingsSource).not.toContain('settings.linkCaptureProjects');
    expect(settingsSource).not.toContain('settings.linkCaptureProjectAdd');
    expect(settingsSource).not.toContain("updateLinkCaptureProject");
  });

  it("persists settings tab edits without refreshing the Memos view on every input event", () => {
    expect(settingsSource).toContain("persistSettings");
    expect(settingsSource).not.toContain("await this.plugin.saveSettings();");
  });

  it("uses Obsidian Setting headings for settings page titles", () => {
    const pageTitleSource = settingsSource.slice(
      settingsSource.indexOf("private renderSettingsPageTitle"),
      settingsSource.indexOf("private renderActiveSettingsTab")
    );

    expect(pageTitleSource).toContain(".setHeading()");
    expect(pageTitleSource).not.toContain('createEl("h2"');
  });

  it("renders debug and maintenance as a help support card with the configured external page", () => {
    const advancedSource = settingsSource.slice(
      settingsSource.indexOf("private renderAdvancedSettings"),
      settingsSource.indexOf("function normalizeDefaultPrefix")
    );

    expect(settingsSource).toContain("MEMOS_PLUS_HELP_SUPPORT_URL");
    expect(settingsSource).toContain("https://d00d1uhgsxk.feishu.cn/wiki/EErRwsN1oibZ14kiBsdcTqq2nyd?from=from_copylink");
    expect(advancedSource).toContain("settings.helpSupport");
    expect(advancedSource).toContain("settings.helpSupportCard");
    expect(advancedSource).toContain("settings.openHelpSupport");
    expect(advancedSource).toContain("memos-plus-settings-support-card");
    expect(advancedSource).toContain("this.containerEl.ownerDocument.defaultView?.open");
    expect(advancedSource).not.toContain("settings.advancedPlaceholder");
  });
});
