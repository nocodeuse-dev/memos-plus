import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync("src/modal.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const widgetSource = readFileSync("src/composerWidget.ts", "utf8");
const deliverySource = readFileSync("src/projectDelivery.ts", "utf8");
const composerActionsSource = readFileSync("src/composerActions.ts", "utf8");
const composerSessionSource = readFileSync("src/composerSession.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");

const quickCaptureSource = modalSource.slice(modalSource.indexOf("export class QuickCaptureModal"), modalSource.indexOf("export class EditMemoModal"));

describe("quick capture shared composer", () => {
  it("uses the same composer widget as the main view instead of a separate textarea flow", () => {
    expect(viewSource).toContain("createComposerSession");
    expect(quickCaptureSource).toContain("createComposerSession");
    expect(composerSessionSource).toContain("new ComposerWidget");
    expect(quickCaptureSource).not.toContain('createEl("textarea"');
  });

  it("keeps toolbar, more menu, callout, code block, image, and Excalidraw behavior in the shared widget", () => {
    expect(widgetSource).toContain("composerToolbar");
    expect(widgetSource).toContain("openComposerToolsMenu");
    expect(widgetSource).toContain('labelKey: "toolbar.insertCodeBlock"');
    expect(widgetSource).toContain('labelKey: "toolbar.insertExcalidraw"');
    expect(widgetSource).toContain('labelKey: "toolbar.clearInput"');
    expect(widgetSource).toContain('setIcon(clearButton, "eraser")');
    expect(widgetSource).toContain("clearInput");
    expect(widgetSource).toContain("isClearInputRisky");
    expect(widgetSource).toContain("window.confirm");
    expect(widgetSource).toContain("onClearDraft");
    expect(widgetSource).toContain("shouldMemosHandleImagePaste");
    expect(widgetSource).toContain("memos-plus-callout-status");
  });

  it("applies shared composer appearance settings to every composer widget", () => {
    expect(widgetSource).toContain("applyAppearanceSettings");
    expect(widgetSource).toContain("--memos-plus-composer-border-color");
    expect(widgetSource).toContain("--memos-plus-composer-background-color");
    expect(stylesSource).toContain("--memos-plus-composer-border-color");
    expect(stylesSource).toContain("--memos-plus-composer-background-color");
    expect(stylesSource).toContain(".memos-plus-composer:focus-within");
  });

  it("keeps the focus ring on the outer composer instead of drawing an inner purple line", () => {
    const outerFocusRule = stylesSource.match(/\.memos-plus-composer:focus-within \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(outerFocusRule).toContain("box-shadow");

    const nativeFocusRule = stylesSource.match(/\.memos-plus-native-editor-host:focus-within \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(nativeFocusRule).toContain("box-shadow: none");
    expect(nativeFocusRule).toContain("outline: none");
    expect(nativeFocusRule).not.toContain("inset");

    const textareaFocusRule = stylesSource.match(/\.memos-plus-composer-input:focus \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(textareaFocusRule).toContain("box-shadow: none");
    expect(textareaFocusRule).toContain("outline: none");
    expect(textareaFocusRule).not.toContain("inset");
  });

  it("uses a neutral text caret inside the composer so the cursor does not read as an extra purple border", () => {
    const nativeHostRule = stylesSource.match(/\.memos-plus-native-editor-host \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(nativeHostRule).toContain("caret-color: var(--text-normal)");

    const cmCursorRule = stylesSource.match(/\.memos-plus-native-editor-host \.cm-cursor \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(cmCursorRule).toContain("border-left-color: var(--text-normal)");

    const textareaRule =
      Array.from(stylesSource.matchAll(/\.memos-plus-composer-input \{([\s\S]*?)\n\}/g))
        .map((match) => match[1])
        .find((rule) => rule.includes("width: 100%")) ?? "";
    expect(textareaRule).toContain("caret-color: var(--text-normal)");
  });

  it("renders composer appearance controls in the input tools settings tab", () => {
    const settingsSource = readFileSync("src/settings.ts", "utf8");
    const i18nSource = readFileSync("src/i18n.ts", "utf8");
    expect(settingsSource).toContain("renderComposerAppearanceSettings");
    expect(settingsSource).toContain("addColorPicker");
    expect(settingsSource).toContain("composerBorderColor");
    expect(settingsSource).toContain("composerBackgroundColor");
    expect(i18nSource).toContain('"settings.composerAppearance": "输入框外观"');
    expect(i18nSource).toContain('"settings.composerAppearance": "Composer appearance"');
  });

  it("shares project delivery and direct default saving between main composer and quick capture", () => {
    expect(deliverySource).toContain("ProjectSendModal");
    expect(deliverySource).toContain("onSaveDefault");
    expect(composerActionsSource).toContain("sendContentToProject(");
    expect(composerActionsSource).toContain("await host.store.addMemo");
    expect(composerActionsSource).toContain("onSaveDefault: saveDefault");
    expect(composerSessionSource).toContain("createComposerActions");
    expect(viewSource).toContain("createComposerSession");
    expect(quickCaptureSource).toContain("createComposerSession");
  });

  it("keeps the quick capture modal minimal and compact", () => {
    expect(quickCaptureSource).toContain("memos-plus-quick-capture-modal");
    expect(quickCaptureSource).not.toContain("modal.quickTitle");
    expect(quickCaptureSource).not.toContain("new Setting(contentEl)");
    expect(quickCaptureSource).not.toContain("modal.cancel");
    expect(stylesSource).toContain(".memos-plus-quick-capture-modal .memos-plus-native-editor-host");
    expect(stylesSource).toContain("max-height: 160px");
  });

  it("keeps mobile composers visible when the iOS keyboard opens", () => {
    expect(widgetSource).toContain("bindMobileKeyboardVisibility");
    expect(widgetSource).toContain("Platform.isMobile");
    expect(widgetSource).toContain("visualViewport");
    expect(widgetSource).toContain("visualViewport.height");
    expect(widgetSource).toContain("focusin");
    expect(widgetSource).toContain("input");
    expect(widgetSource).toContain("scheduleMobileKeyboardRevealSequence");
    expect(widgetSource).toContain("memos-plus-quick-capture-keyboard-shell");
    expect(quickCaptureSource).toContain("this.modalEl.addClass");
    expect(widgetSource).toContain("--memos-plus-keyboard-shift");
    expect(widgetSource).toContain("--memos-plus-mobile-viewport-height");
    expect(widgetSource).toContain("window.setTimeout");
    expect(widgetSource).toContain("scrollIntoView");
    expect(stylesSource).toContain("--memos-plus-keyboard-inset");
    expect(stylesSource).toContain("--memos-plus-keyboard-shift");
    expect(stylesSource).toContain("--memos-plus-mobile-viewport-height");
    expect(stylesSource).toContain(".memos-plus-quick-capture-modal.is-keyboard-open");
    expect(stylesSource).toContain(".modal.memos-plus-quick-capture-keyboard-shell.is-keyboard-open");
    expect(stylesSource).toContain("max-height: calc(var(--memos-plus-mobile-viewport-height");
    expect(stylesSource).toContain("env(safe-area-inset-bottom");
    expect(stylesSource).toContain("overflow-y: auto");
  });
});
