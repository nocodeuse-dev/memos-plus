import { describe, expect, it, vi } from "vitest";
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
  normalizePath: (value: string) => value
}));

import {
  AUTO_CLIPBOARD_SOURCE,
  getClipboardFingerprint,
  markClipboardAutoApplied,
  markClipboardDismissed,
  normalizeClipboardAutoFillState,
  shouldAutoApplyClipboard,
  wasClipboardContentAutoApplied
} from "../src/clipboardAutoFill";
import { getQuickCaptureInitialContent } from "../src/quickCaptureContent";
import type { MemosPlusSettings } from "../src/settings";

function settings(overrides: Record<string, unknown> = {}): MemosPlusSettings {
  return {
    quickCaptureAutoSelection: true,
    quickCaptureDetectClipboard: true,
    quickCaptureClipboardDesktopMode: "replace",
    quickCaptureClipboardMobileMode: "replace",
    quickCaptureExistingContentMode: "ask",
    quickCaptureRecognizeClipboardLinks: true,
    ...overrides
  } as MemosPlusSettings;
}

describe("clipboard auto-fill dedupe", () => {
  it("allows first auto read of a clipboard text", () => {
    const state = normalizeClipboardAutoFillState({});
    expect(shouldAutoApplyClipboard("重复内容", { context: "main", state, now: 2000 })).toBe(true);
  });

  it("prevents the same clipboard text from being auto-applied again", () => {
    const state = normalizeClipboardAutoFillState({});
    const now = 2000;
    expect(shouldAutoApplyClipboard("重复内容", { context: "main", state, now })).toBe(true);
    expect(
      markClipboardAutoApplied("重复内容", {
        context: "main",
        source: AUTO_CLIPBOARD_SOURCE,
        state,
        now
      })
    ).toBe(true);
    expect(shouldAutoApplyClipboard("重复内容", { context: "main", state, now: now + 5000 })).toBe(false);
  });

  it("stops auto-apply after the user clears the same auto-filled content", () => {
    const state = normalizeClipboardAutoFillState({});
    expect(
      markClipboardAutoApplied("要清除的内容", {
        context: "main",
        source: AUTO_CLIPBOARD_SOURCE,
        state,
        now: 1000
      })
    ).toBe(true);
    expect(wasClipboardContentAutoApplied("要清除的内容", state)).toBe(true);
    expect(
      markClipboardDismissed("要清除的内容", {
        context: "main",
        source: AUTO_CLIPBOARD_SOURCE,
        state,
        now: 2000
      })
    ).toBe(true);
    expect(shouldAutoApplyClipboard("要清除的内容", { context: "main", state, now: 3000 })).toBe(false);
  });

  it("allows new clipboard text after content changes", () => {
    const state = normalizeClipboardAutoFillState({});
    expect(
      markClipboardAutoApplied("旧内容", {
        context: "main",
        source: AUTO_CLIPBOARD_SOURCE,
        state,
        now: 1000
      })
    ).toBe(true);
    expect(shouldAutoApplyClipboard("新内容", { context: "main", state, now: 3000 })).toBe(true);
  });

  it("does not persist raw clipboard content and only stores fingerprint metadata", () => {
    const state = normalizeClipboardAutoFillState({});
    const content = "这是隐私文本 123";
    expect(
      markClipboardAutoApplied(content, {
        context: "main",
        source: AUTO_CLIPBOARD_SOURCE,
        state,
        now: 1000
      })
    ).toBe(true);
    expect(state.history).toHaveLength(1);
    const record = state.history[0];
    expect(record.fingerprint).toBe(getClipboardFingerprint(content));
    expect(record.length).toBe(content.length);
    expect(record.context).toBe("main");
    expect(record.source).toBe(AUTO_CLIPBOARD_SOURCE);
    expect(record.action).toBe("auto-filled");
    expect(JSON.stringify(record)).not.toContain(content);
    expect(record).not.toHaveProperty("text");
  });

  it("keeps auto-detect skip behavior aligned for clipboard links", async () => {
    const state = normalizeClipboardAutoFillState({});
    const result = await getQuickCaptureInitialContent({
      settings: settings({
        quickCaptureClipboardDesktopMode: "replace",
        quickCaptureRecognizeClipboardLinks: true
      }),
      existingContent: "",
      readSelection: () => "",
      readClipboardText: async () => "https://example.com/article/clip",
      clipboardAutoFillState: state,
      clipboardAutoFillContext: "main",
      clipboardThrottleMs: 0
    });

    expect(result?.source).toBe("clipboard-link");

    expect(
      markClipboardAutoApplied("https://example.com/article/clip", {
        context: "main",
        source: AUTO_CLIPBOARD_SOURCE,
        state,
        now: 1000
      })
    ).toBe(true);
    const repeated = await getQuickCaptureInitialContent({
      settings: settings({
        quickCaptureClipboardDesktopMode: "replace",
        quickCaptureRecognizeClipboardLinks: true
      }),
      existingContent: "",
      readSelection: () => "",
      readClipboardText: async () => "https://example.com/article/clip",
      clipboardAutoFillState: state,
      clipboardAutoFillContext: "main",
      clipboardThrottleMs: 0
    });
    expect(repeated).toBeNull();
  });
});
