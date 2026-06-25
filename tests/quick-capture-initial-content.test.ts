import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, type MemosPlusSettings } from "../src/settings";
import { getQuickCaptureInitialContent, quickCaptureClipboardModeForPlatform } from "../src/quickCaptureContent";

const obsidianMock = vi.hoisted(() => ({
  Platform: { isMobile: false }
}));

vi.mock("obsidian", () => ({
  Platform: obsidianMock.Platform,
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
      settings: settings({ quickCaptureClipboardDesktopMode: "replace" }),
      existingContent: "",
      readSelection: () => "",
      readClipboardText: async () => "剪贴板文字"
    });

    expect(result).toEqual({ action: "replace", content: "剪贴板文字", source: "clipboard-text" });
  });

  it("marks clipboard URLs as link content when link recognition is enabled", async () => {
    const result = await getQuickCaptureInitialContent({
      settings: settings({ quickCaptureClipboardDesktopMode: "replace", quickCaptureRecognizeClipboardLinks: true }),
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

  it("migrates the legacy clipboard mode to desktop and mobile settings without keeping the old stored field", () => {
    const migrated = normalizeSettings({ quickCaptureClipboardMode: "append" });

    expect(migrated.quickCaptureClipboardDesktopMode).toBe("append");
    expect(migrated.quickCaptureClipboardMobileMode).toBe("append");
    expect(migrated).not.toHaveProperty("quickCaptureClipboardMode");
  });

  it("normalizes desktop and mobile clipboard modes independently", () => {
    const normalized = normalizeSettings({
      quickCaptureClipboardMode: "append",
      quickCaptureClipboardDesktopMode: "replace",
      quickCaptureClipboardMobileMode: "off"
    });

    expect(normalized.quickCaptureClipboardDesktopMode).toBe("replace");
    expect(normalized.quickCaptureClipboardMobileMode).toBe("off");
  });

  it("uses desktop clipboard mode on desktop and as the safe fallback", () => {
    const configured = settings({
      quickCaptureClipboardDesktopMode: "replace",
      quickCaptureClipboardMobileMode: "off"
    });

    expect(quickCaptureClipboardModeForPlatform(configured, false)).toBe("replace");
    expect(quickCaptureClipboardModeForPlatform(configured, undefined)).toBe("replace");
  });

  it("uses mobile clipboard mode on phones and tablets", async () => {
    obsidianMock.Platform.isMobile = true;
    try {
      const result = await getQuickCaptureInitialContent({
        settings: settings({
          quickCaptureClipboardDesktopMode: "replace",
          quickCaptureClipboardMobileMode: "off"
        }),
        existingContent: "",
        readSelection: () => "",
        readClipboardText: async () => "移动端剪贴板"
      });

      expect(result).toBeNull();
    } finally {
      obsidianMock.Platform.isMobile = false;
    }
  });
});
