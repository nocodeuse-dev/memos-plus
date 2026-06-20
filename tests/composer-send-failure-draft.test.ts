import { describe, expect, it, vi } from "vitest";
import { createComposerActions } from "../src/composerActions";
import { resolveComposerInitialContent } from "../src/composerSession";
import { normalizeSettings } from "../src/settings";

vi.mock("obsidian", () => ({
  App: class {},
  Menu: class {},
  Modal: class {},
  Notice: vi.fn(),
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

function fakeComposer(value: string) {
  return {
    element: { getBoundingClientRect: () => ({ right: 0, bottom: 0 }) },
    manualCalloutMode: false,
    getValue: vi.fn(() => value),
    clear: vi.fn(),
    focus: vi.fn(),
    resetCalloutMode: vi.fn()
  };
}

describe("composer send failure draft recovery", () => {
  it("preserves the current composer content as a failure draft when default saving fails", async () => {
    const settings = normalizeSettings({
      sendFailureDraftEnabled: true,
      sendFailureDraftContent: ""
    });
    const composer = fakeComposer("移动端失败也不能丢");
    const persistSettings = vi.fn(async () => {});
    const actions = createComposerActions(
      {
        app: { workspace: { getActiveFile: () => ({ basename: "memos plus" }) } },
        store: {
          addMemo: vi.fn(async () => {
            throw new Error("write failed");
          })
        },
        settings,
        persistSettings,
        refreshViews: vi.fn(async () => {})
      } as never,
      () => composer as never
    );

    await expect(actions.saveDefault()).resolves.toBeUndefined();

    expect(settings.sendFailureDraftContent).toBe("移动端失败也不能丢");
    expect(persistSettings).toHaveBeenCalled();
    expect(composer.clear).not.toHaveBeenCalled();
    expect(composer.focus).toHaveBeenCalled();
  });

  it("restores a saved failure draft when no explicit initial content is provided", () => {
    const settings = normalizeSettings({
      sendFailureDraftEnabled: true,
      sendFailureDraftContent: "上次失败的输入"
    });

    expect(resolveComposerInitialContent(settings, undefined)).toBe("上次失败的输入");
    expect(resolveComposerInitialContent(settings, "命令传入内容")).toBe("命令传入内容");
    expect(resolveComposerInitialContent({ ...settings, sendFailureDraftEnabled: false }, undefined)).toBeUndefined();
  });
});
