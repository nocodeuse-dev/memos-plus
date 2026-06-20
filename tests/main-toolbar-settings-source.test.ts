import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("main toolbar settings button source", () => {
  it("places a Memos settings button between search and reload", () => {
    const toolbarBlock = viewSource.match(/private renderHomeToolbar\([\s\S]*?\n {2}\}/)?.[0] ?? "";

    expect(toolbarBlock).toContain("settings.openMemosSettings");
    expect(toolbarBlock).toContain("this.openMemosSettings()");
    expect(toolbarBlock).toContain('setIcon(settingsButton, "settings")');
    expect(toolbarBlock.indexOf("const search = toolbar.createEl")).toBeLessThan(toolbarBlock.indexOf("const settingsButton = toolbar.createEl"));
    expect(toolbarBlock.indexOf("const settingsButton = toolbar.createEl")).toBeLessThan(toolbarBlock.indexOf("const reload = toolbar.createEl"));
  });

  it("opens the Obsidian settings page for the current plugin", () => {
    const helperBlock = viewSource.match(/private openMemosSettings\(\): void \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";

    expect(helperBlock).toContain("setting?.open?.()");
    expect(helperBlock).toContain("setting?.openTabById?.(this.plugin.manifest.id)");
  });

  it("localizes the settings button tooltip", () => {
    expect(i18nSource).toContain('"settings.openMemosSettings": "Memos 设置"');
    expect(i18nSource).toContain('"settings.openMemosSettings": "Memos settings"');
  });
});
