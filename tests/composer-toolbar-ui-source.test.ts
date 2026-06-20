import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const widgetSource = readFileSync("src/composerWidget.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("composer toolbar visibility UI", () => {
  it("renders configurable tools and sends hidden tools to an Obsidian more menu", () => {
    expect(widgetSource).toContain("composerToolbar");
    expect(widgetSource).toContain("openComposerToolsMenu");
    expect(widgetSource).toContain('setIcon(moreButton, "more-horizontal")');
    expect(widgetSource).toContain('labelKey: "toolbar.insertCodeBlock"');
    expect(widgetSource).toContain('labelKey: "toolbar.insertExcalidraw"');
    expect(widgetSource).toContain("const linkName = file.basename");
  });

  it("renders toolbar visibility toggles in the Memos settings tab", () => {
    expect(settingsSource).toContain("renderToolbarSettings");
    expect(settingsSource).toContain('"settings.toolbarSettings"');
    expect(settingsSource).toContain("composerToolbar");
  });

  it("includes Chinese and English labels for the new tools and more menu", () => {
    expect(i18nSource).toContain('"toolbar.more": "更多工具"');
    expect(i18nSource).toContain('"toolbar.insertCodeBlock": "插入代码块"');
    expect(i18nSource).toContain('"toolbar.insertExcalidraw": "新建 Excalidraw"');
    expect(i18nSource).toContain('"toolbar.more": "More tools"');
  });
});
