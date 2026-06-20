import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type MemosPlusSettings } from "../src/settings";
import { getQuickCaptureInitialContent } from "../src/quickCaptureContent";

vi.mock("obsidian", () => ({
  App: class {},
  MarkdownView: class {},
  Modal: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

function settings(overrides: Partial<MemosPlusSettings> = {}): MemosPlusSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("quick capture initial content", () => {
  it("prefers current editor selection over clipboard text", async () => {
    const result = await getQuickCaptureInitialContent({
      settings: settings(),
      existingContent: "",
      readSelection: () => "选中文字",
      readClipboardText: async () => "剪贴板文字"
    });

    expect(result).toEqual({ action: "replace", content: "选中文字", source: "selection" });
  });

  it("uses clipboard text when selection is empty and clipboard detection is enabled", async () => {
    const result = await getQuickCaptureInitialContent({
      settings: settings({ quickCaptureClipboardMode: "replace" }),
      existingContent: "",
      readSelection: () => "",
      readClipboardText: async () => "剪贴板文字"
    });

    expect(result).toEqual({ action: "replace", content: "剪贴板文字", source: "clipboard-text" });
  });

  it("marks clipboard URLs as link content when link recognition is enabled", async () => {
    const result = await getQuickCaptureInitialContent({
      settings: settings({ quickCaptureClipboardMode: "replace", quickCaptureRecognizeClipboardLinks: true }),
      existingContent: "",
      readSelection: () => "",
      readClipboardText: async () => "https://example.com/page"
    });

    expect(result?.source).toBe("clipboard-link");
  });

  it("asks before changing an existing draft and can append the incoming content", async () => {
    const result = await getQuickCaptureInitialContent({
      settings: settings({ quickCaptureExistingContentMode: "ask" }),
      existingContent: "已有草稿",
      readSelection: () => "选中文字",
      chooseAction: async () => "append"
    });

    expect(result).toEqual({ action: "append", content: "选中文字", source: "selection" });
  });

  it("does not read the clipboard when clipboard detection is disabled", async () => {
    const result = await getQuickCaptureInitialContent({
      settings: settings({ quickCaptureDetectClipboard: false }),
      existingContent: "",
      readSelection: () => "",
      readClipboardText: async () => "剪贴板文字"
    });

    expect(result).toBeNull();
  });
});
