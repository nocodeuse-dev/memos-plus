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
});
