import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("quick input sidebar view", () => {
  it("registers an independent sidebar view and command", () => {
    expect(mainSource).toContain("MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE");
    expect(mainSource).toContain("MemosPlusQuickInputView");
    expect(mainSource).toContain("open-memos-plus-quick-input-sidebar");
    expect(mainSource).toContain("activateQuickInputView");
    expect(mainSource).toContain("detachLeavesOfType(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE)");
    expect(i18nSource).toContain('"command.openQuickInputSidebar": "打开 Memos Plus 快速输入侧边栏"');
  });

  it("uses the shared composer widget and shared send actions", () => {
    const sessionSource = readFileSync("src/composerSession.ts", "utf8");

    expect(quickInputSource).toContain("extends ItemView");
    expect(quickInputSource).toContain("createComposerSession");
    expect(sessionSource).toContain("new ComposerWidget");
    expect(sessionSource).toContain("createComposerActions");
    expect(quickInputSource).toContain("quickInputDraft");
    expect(quickInputSource).toContain("focusComposer()");
    expect(quickInputSource).not.toContain("this.composerSession.focus();");
    expect(mainSource).toContain("focusComposer && existing.view instanceof MemosPlusQuickInputView");
    expect(mainSource).toContain("focusComposer && leaf.view instanceof MemosPlusQuickInputView");
    expect(quickInputSource).not.toContain('createEl("textarea"');
    expect(quickInputSource).toContain("sendActionForQuickInput");
    expect(quickInputSource).not.toContain("renderQuickActions");
    expect(quickInputSource).not.toContain("memos-plus-quick-input-actions");
  });

  it("adds quick input settings without changing the existing composer toolbar settings", () => {
    for (const field of [
      "quickInputEnabled",
      "quickInputAutoOpen",
      "quickInputPreserveDraft",
      "quickInputDefaultSendAction",
      "quickInputDraft",
      "quickInputShowDirectory",
      "quickInputDirectoryLimit",
      "quickInputDirectoryExpandedLimit",
      "quickInputDirectoryMobileExpandedLimit"
    ]) {
      expect(settingsSource).toContain(field);
    }
    expect(i18nSource).toContain('"settings.quickInputSidebar": "侧边栏快速输入"');
    expect(i18nSource).toContain('"settings.quickInputAutoOpen": "自动打开侧边栏"');
    expect(i18nSource).toContain('"settings.quickInputDefaultSendAction": "侧边栏默认发送方式"');
    expect(settingsSource).toContain("normalizeQuickInputSendAction");
  });

  it("auto-opens the sidebar safely after layout ready without focusing the composer", () => {
    expect(settingsSource).toContain("quickInputAutoOpen: true");
    expect(mainSource).toContain("this.app.workspace.onLayoutReady");
    expect(mainSource).toContain("activateQuickInputView({ focusComposer: false, useModalFallback: false })");
    expect(mainSource).toContain("useModalFallback = options.useModalFallback ?? true");
    expect(mainSource).toContain("shouldUseQuickInputModalFallback() && useModalFallback");
  });

  it("renders the compact directory area below the shared composer with lazy preview loading", () => {
    expect(quickInputSource).toContain("renderDirectoryArea");
    expect(quickInputSource).toContain("renderDirectoryResults");
    expect(quickInputSource).toContain("selectDirectoryEntry");
    expect(quickInputSource).toContain("previewCache");
    expect(quickInputSource).toContain("selectedDirectoryId");
    expect(quickInputSource).toContain("memos-plus-quick-directory-results");
    expect(quickInputSource).not.toContain("expandedDirectoryPath");
    expect(quickInputSource).not.toContain("toggleDirectoryPath");
    expect(quickInputSource).not.toContain("isDirectoryExpanded");
    expect(quickInputSource).toContain("buildQuickInputDirectoryEntries");
    expect(quickInputSource).toContain("buildQuickInputDirectoryPreview");
    expect(quickInputSource).toContain("setTimeout");
    expect(quickInputSource).toContain("quickInputDirectoryExpandedLimit");
    expect(quickInputSource).toContain("quickInputDirectoryMobileExpandedLimit");
    expect(quickInputSource).toContain("openMemoSource");
    expect(quickInputSource).toContain("maxResults: limit");
    expect(quickInputSource).toContain("maxContentReads");
    expect(quickInputSource).not.toContain("app.vault.read(");
  });

  it("uses sidebar display modules to gate composer, directory, result list, and counts", () => {
    expect(quickInputSource).toContain('resolveViewLayoutModules(this.plugin.settings.sidebarLayout, "sidebar")');
    expect(quickInputSource).toContain("shouldRenderSidebarQuickInput");
    expect(quickInputSource).toContain("shouldRenderSidebarDirectory");
    expect(quickInputSource).toContain("shouldRenderSidebarFileList");
    expect(quickInputSource).toContain("shouldRenderSidebarFileCount");
    expect(quickInputSource).toContain("includeCounts: this.shouldRenderSidebarFileCount(modules)");
    expect(quickInputSource).toContain("if (!this.shouldRenderSidebarFileList(this.sidebarModules()))");
    expect(quickInputSource).toContain("is-compact-layout");
  });
});
