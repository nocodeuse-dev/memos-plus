import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const composerWidgetSource = readFileSync("src/composerWidget.ts", "utf8");
const nativeComposerSource = readFileSync("src/nativeComposer.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");
const quickCaptureSource = readFileSync("src/modal.ts", "utf8");
const quickCaptureContentSource = readFileSync("src/quickCaptureContent.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const iconPickerSource = readFileSync("src/iconPicker.ts", "utf8");
const savedSearchModalSource = readFileSync("src/savedSearchModal.ts", "utf8");
const projectSendModalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
const sidebarGroupModalSource = readFileSync("src/sidebarGroupModal.ts", "utf8");
const templateManagerModalSource = readFileSync("src/templateManagerModal.ts", "utf8");
const taskOptionsModalSource = readFileSync("src/taskOptionsModal.ts", "utf8");
const diagnosticsSource = existsSync("src/diagnostics.ts") ? readFileSync("src/diagnostics.ts", "utf8") : "";
const modalSafetySource = existsSync("src/mobileModalSafety.ts") ? readFileSync("src/mobileModalSafety.ts", "utf8") : "";
const settingsSource = readFileSync("src/settings.ts", "utf8");

describe("mobile interaction stability source", () => {
  it("only reveals the composer for keyboard changes while the composer is the active interaction target", () => {
    expect(composerWidgetSource).toContain("isMobileKeyboardSessionActive");
    expect(composerWidgetSource).toContain("handleDocumentPointer");
    expect(composerWidgetSource).toContain("!this.element.contains(target)");
    expect(composerWidgetSource).toContain("this.mobileKeyboardActive = false");
    expect(composerWidgetSource).toContain("!this.isComposerEditorActive()");
    expect(composerWidgetSource).toContain("if (!this.isMobileKeyboardSessionActive())");
    expect(composerWidgetSource).toContain("scheduleMobileKeyboardViewportUpdate");
    expect(nativeComposerSource).toContain("Platform.isMobile");
    expect(nativeComposerSource).toContain('host.addEventListener("touchstart", focusEditor, true)');
    expect(nativeComposerSource).toContain('host.addEventListener("mousedown", focusEditor, true)');
    expect(nativeComposerSource).toContain('host.addEventListener("click", focusEditor, true)');
  });

  it("keeps modal autofocus desktop-only so mobile modals do not immediately open the keyboard", () => {
    expect(quickCaptureSource).not.toContain("focusAfterIncomingContent");
    expect(quickCaptureSource).toContain('import { focusOnDesktopOnly } from "./modalFocus";');
    expect(quickCaptureSource).toContain("focusOnDesktopOnly(this.composerSession);");
    expect(quickCaptureSource).not.toContain("this.composerSession.focus();");
    expect(quickCaptureSource).toContain("focusOnDesktopOnly(this.textarea);");

    for (const source of [
      iconPickerSource,
      savedSearchModalSource,
      projectSendModalSource,
      sidebarGroupModalSource,
      templateManagerModalSource
    ]) {
      expect(source).toContain("focusOnDesktopOnly");
    }

    expect(quickInputSource).not.toContain("focusAfterIncomingContent");
    expect(quickInputSource).not.toContain("this.composerSession.focus();");
    expect(quickInputSource).toContain("focusComposer(): void");
    expect(projectSendModalSource).not.toContain("this.input.focus();");
    expect(projectSendModalSource).not.toContain("this.titleInput.focus();");
    expect(projectSendModalSource).not.toContain("input.focus();");
    expect(templateManagerModalSource).not.toContain("advancedInput.focus();");
  });

  it("records diagnostic evidence that distinguishes plugin reloads from view recreation and WebView restarts", () => {
    expect(diagnosticsSource).toContain("MAX_DIAGNOSTIC_ENTRIES = 200");
    expect(diagnosticsSource).toContain("memos-plus-diagnostic-log-v1");
    expect(diagnosticsSource).toContain("getMemosPlusDiagnosticEntries");
    expect(diagnosticsSource).toContain("exportMemosPlusDiagnosticLog");
    expect(diagnosticsSource).toContain("setMemosPlusDiagnosticState");
    expect(diagnosticsSource).toContain("currentPage");
    expect(diagnosticsSource).toContain("currentModal");
    expect(diagnosticsSource).toContain("inputFocused");
    expect(diagnosticsSource).toContain("inputContentLength");
    expect(diagnosticsSource).toContain("isRendering");
    expect(diagnosticsSource).toContain("isSaving");
    expect(diagnosticsSource).toContain("createMemosPlusSessionId");
    expect(diagnosticsSource).toContain("memos-plus:onload");
    expect(diagnosticsSource).toContain("memos-plus:onunload");
    expect(diagnosticsSource).toContain("view:constructor");
    expect(diagnosticsSource).toContain("view:onOpen");
    expect(diagnosticsSource).toContain("view:onClose");
    expect(diagnosticsSource).toContain("modal:onOpen");
    expect(diagnosticsSource).toContain("modal:onClose");
    expect(diagnosticsSource).toContain("settings:save");
    expect(diagnosticsSource).toContain("settings:persist");
    expect(diagnosticsSource).toContain("view:render");
    expect(diagnosticsSource).toContain("view:render-start");
    expect(diagnosticsSource).toContain("view:render-end");
    expect(diagnosticsSource).toContain("main:render-start");
    expect(diagnosticsSource).toContain("main:render-end");
    expect(diagnosticsSource).toContain("sidebar:render-start");
    expect(diagnosticsSource).toContain("sidebar:render-end");
    expect(diagnosticsSource).toContain("view:refresh");
    expect(diagnosticsSource).toContain("workspace:layout-change");
    expect(diagnosticsSource).toContain("visualViewport:resize");
    expect(diagnosticsSource).toContain("window:resize");
    expect(diagnosticsSource).toContain("data:load");
    expect(diagnosticsSource).toContain("data:save");
    expect(diagnosticsSource).toContain("modal:option-click");
    expect(diagnosticsSource).toContain("input:focus");
    expect(diagnosticsSource).toContain("input:blur");
    expect(diagnosticsSource).toContain("window:error");
    expect(diagnosticsSource).toContain("window:unhandledrejection");
    expect(mainSource).toContain("registerMemosPlusDiagnostics");
    expect(mainSource).toContain("exportMemosPlusDiagnosticLog");
    expect(mainSource).toContain('id: "export-diagnostic-log"');
    expect(mainSource).toContain("async exportDiagnosticLog()");
    expect(mainSource).toContain("logMemosPlusDiagnostic(\"data:load\"");
    expect(mainSource).toContain("logMemosPlusDiagnostic(\"data:save\"");
    expect(mainSource).toContain("logMemosPlusDiagnostic(\"memos-plus:onload\"");
    expect(mainSource).toContain("logMemosPlusDiagnostic(\"memos-plus:onunload\"");
    expect(viewSource).toContain("setMemosPlusDiagnosticState({ isRendering: true");
    expect(viewSource).toContain("setMemosPlusDiagnosticState({ isRendering: false");
    expect(viewSource).toContain("logMemosPlusDiagnostic(\"main:render-start\"");
    expect(viewSource).toContain("logMemosPlusDiagnostic(\"main:render-end\"");
    expect(viewSource).toContain("logMemosPlusDiagnostic(\"sidebar:render-start\"");
    expect(viewSource).toContain("logMemosPlusDiagnostic(\"sidebar:render-end\"");
    expect(viewSource).toContain("showDiagnosticButton");
    expect(viewSource).toContain("this.plugin.exportDiagnosticLog()");
    expect(settingsSource).toContain("renderDiagnosticExport");
    expect(settingsSource).toContain("this.plugin.exportDiagnosticLog()");
    expect(modalSafetySource).toContain("logMemosPlusDiagnostic(\"modal:option-click\"");
  });

  it("wraps every Memos Plus modal in mobile lifecycle diagnostics and a duplicate-click guard", () => {
    expect(modalSafetySource).toContain("registerMemosPlusModalOpen");
    expect(modalSafetySource).toContain("registerMemosPlusModalClose");
    expect(modalSafetySource).toContain("withMobileClickLock");
    expect(modalSafetySource).toContain("mobileModalResultLimit");
    expect(modalSafetySource).toContain("isMobileModalSafeMode");

    for (const source of [
      quickCaptureSource,
      quickCaptureContentSource,
      iconPickerSource,
      savedSearchModalSource,
      projectSendModalSource,
      sidebarGroupModalSource,
      templateManagerModalSource,
      taskOptionsModalSource
    ]) {
      expect(source).toContain("registerMemosPlusModalOpen");
      expect(source).toContain("registerMemosPlusModalClose");
    }

    expect(projectSendModalSource).toContain("withMobileClickLock");
    expect(taskOptionsModalSource).toContain("withMobileClickLock");
    expect(sidebarGroupModalSource).toContain("withMobileClickLock");
  });

  it("uses mobile modal safe mode to avoid heavy previews and oversized result lists", () => {
    expect(savedSearchModalSource).toContain("isMobileModalSafeMode");
    expect(savedSearchModalSource).toContain("renderMobileSafePreviewPlaceholder");
    expect(savedSearchModalSource).not.toContain("const matches = search.conditions.length > 0 ? await this.options.searchVault(search) : [];");

    expect(projectSendModalSource).toContain("mobileModalResultLimit");
    expect(projectSendModalSource).not.toContain(".slice(0, 120)");
    expect(projectSendModalSource).not.toContain(".slice(0, 100)");
    expect(templateManagerModalSource).toContain("mobileModalResultLimit");
    expect(templateManagerModalSource).not.toContain(".slice(0, 120)");
  });

  it("keeps the mobile home composer bounded, top-aligned, and internally scrollable", () => {
    expect(stylesSource).toContain("--memos-plus-mobile-composer-min-height: 120px");
    expect(stylesSource).toContain("--memos-plus-mobile-composer-max-height: min(40vh, 280px)");
    expect(stylesSource).toContain(".memos-plus-view .memos-plus-native-editor-host");
    expect(stylesSource).toContain("min-height: var(--memos-plus-mobile-composer-min-height)");
    expect(stylesSource).toContain("max-height: var(--memos-plus-mobile-composer-max-height)");
    expect(stylesSource).toContain("overflow-y: auto");
    expect(stylesSource).toContain("align-items: flex-start");
    expect(stylesSource).toContain("box-sizing: border-box");
    expect(stylesSource).toContain(".memos-plus-view.is-keyboard-open");
  });

  it("clamps textarea autoresize on mobile instead of trusting a raw scrollHeight", () => {
    expect(nativeComposerSource).toContain("composerAutoResizeBounds");
    expect(nativeComposerSource).toContain("Platform.isMobile");
    expect(nativeComposerSource).toContain("Math.min");
    expect(nativeComposerSource).toContain("Math.max");
    expect(nativeComposerSource).toContain("element.value.trim() ? element.scrollHeight");
    expect(nativeComposerSource).toContain("element.style.overflowY");
  });

  it("hides the mobile floating action button while the home composer is focused", () => {
    expect(composerWidgetSource).toContain("setMobileComposerFocusState");
    expect(composerWidgetSource).toContain('".memos-plus-view"');
    expect(composerWidgetSource).toContain('".memos-plus-shell, .memos-plus-mobile-light-shell"');
    expect(stylesSource).toContain(".memos-plus-shell.is-composer-focused .memos-plus-fab");
    expect(stylesSource).toContain("pointer-events: none");
    expect(viewSource).toContain("renderMobileFab(shell)");
    expect(viewSource).not.toContain("renderMobileFab(shell);\n        return;");
  });

  it("clears composer content locally on mobile without focusing, scrolling, or rerendering the view", () => {
    const clearBlock = composerWidgetSource.match(/private async clearInput\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(clearBlock).toContain("this.composer.clear()");
    expect(clearBlock).toContain("this.calloutMode = false");
    expect(clearBlock).toContain("this.handleInputContentUpdated(false)");
    expect(clearBlock).toContain("await this.options.onClearDraft?.()");
    expect(clearBlock).not.toContain(".focus(");
    expect(clearBlock).not.toContain("scrollIntoView");
    expect(clearBlock).not.toContain("render(");
    expect(clearBlock).not.toContain("refreshViews");
  });

  it("treats only the editor surface, not toolbar buttons, as a mobile keyboard target", () => {
    const keyboardBlock = composerWidgetSource.slice(
      composerWidgetSource.indexOf("private bindMobileKeyboardVisibility"),
      composerWidgetSource.indexOf("private scrollComposerIntoView")
    );
    expect(composerWidgetSource).toContain("isComposerEditorActive");
    expect(keyboardBlock).toContain("!this.isComposerEditorActive()");
    expect(keyboardBlock).not.toContain("!this.element.contains(document.activeElement)");
  });
});
