import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const modalSource = readFileSync("src/modal.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const quickCaptureContentSource = readFileSync("src/quickCaptureContent.ts", "utf8");
const composerSessionSource = readFileSync("src/composerSession.ts", "utf8");
const widgetSource = readFileSync("src/composerWidget.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("quick capture content sources", () => {
  it("keeps quick capture auto mode and clipboard quick capture without a duplicate selection command", () => {
    expect(mainSource).toContain("quick-capture");
    expect(mainSource).toContain('openQuickCaptureWithContentSource("auto")');
    expect(mainSource).not.toContain("quick-capture-selection");
    expect(mainSource).toContain("quick-capture-clipboard");
    expect(mainSource).not.toContain("command.quickCaptureSelection");
    expect(mainSource).toContain("command.quickCaptureClipboard");
    expect(mainSource).toContain("openQuickCaptureWithContentSource");
  });

  it("registers an Obsidian URI for iPhone quick capture launch", () => {
    expect(mainSource).toContain('registerObsidianProtocolHandler("memos-plus"');
    expect(mainSource).toContain("handleMemosPlusProtocol");
    expect(mainSource).toContain('mode === "clipboard"');
    expect(mainSource).toContain("openQuickCaptureWithInitialContent");
    expect(mainSource).toContain('initialContentMode: "none"');
  });

  it("wires quick capture modal through the shared initial-content function", () => {
    expect(modalSource).toContain("createComposerSession");
    expect(composerSessionSource).toContain("getQuickCaptureInitialContent");
    expect(composerSessionSource).toContain("applyInitialContent");
    expect(modalSource).toContain("initialContentMode");
    expect(composerSessionSource).toContain("processInputContentChange");
  });

  it("lets the sidebar quick input fill selection or clipboard without duplicating source logic", () => {
    expect(quickInputSource).toContain("createComposerSession");
    expect(quickInputSource).not.toContain("quickInput.insertSelection");
    expect(quickInputSource).not.toContain("quickInput.insertClipboard");
    expect(composerSessionSource).toContain("getQuickCaptureInitialContent");
    expect(composerSessionSource).toContain("applyIncomingContent");
  });

  it("routes manual paste and clipboard prompt fill/append through shared input link analysis", () => {
    expect(widgetSource).toContain("processInputContentChange");
    expect(widgetSource).toContain("quick-input-paste");
    expect(widgetSource).toContain("link-analysis-start");
    expect(widgetSource).toContain("link-analysis-result");
    expect(widgetSource).toContain("resolveMarkdownLink");

    expect(composerSessionSource).toContain("clipboard-fill");
    expect(composerSessionSource).toContain("clipboard-append");
    expect(composerSessionSource).toContain("processInputContentChange");
    expect(composerSessionSource).not.toContain("widget.setValue(mergeComposerContent");

    expect(mainSource).toContain("resolveMarkdownLink: (text) => this.resolveMarkdownLink(text)");
    expect(modalSource).toContain("resolveMarkdownLink");
    expect(quickInputSource).toContain("resolveMarkdownLink");
  });

  it("adds settings and Chinese labels for quick capture content sources", () => {
    for (const field of [
      "quickCaptureAutoSelection",
      "quickCaptureDetectClipboard",
      "sidebarAutoDetectClipboard",
      "quickCaptureClipboardDesktopMode",
      "quickCaptureClipboardMobileMode",
      "quickCaptureExistingContentMode",
      "quickCaptureRecognizeClipboardLinks"
    ]) {
      expect(settingsSource).toContain(field);
    }
    expect(settingsSource).toContain("renderQuickCaptureContentSourceSettings");
    expect(settingsSource).toContain("settings.sidebarAutoDetectClipboard");
    expect(settingsSource).toContain("settings.quickCaptureClipboardDesktopMode");
    expect(settingsSource).toContain("settings.quickCaptureClipboardMobileMode");
    expect(quickCaptureContentSource).toContain("quickCaptureClipboardModeForPlatform");
    expect(i18nSource).toContain('"settings.quickCaptureContentSource": "快速记录内容来源"');
    expect(i18nSource).toContain('"settings.sidebarAutoDetectClipboard": "侧边栏自动检测剪贴板"');
    expect(i18nSource).toContain('"quickCaptureContent.clipboardEmpty": "剪贴板为空"');
  });

  it("gates only sidebar auto clipboard detection without disabling manual paste", () => {
    expect(quickInputSource).toContain("sidebarAutoDetectClipboard");
    expect(quickInputSource).toContain('applyInitialContent("none")');
    expect(widgetSource).toContain("quick-input-paste");
    expect(widgetSource).toContain("processInputContentChange");
  });
});
