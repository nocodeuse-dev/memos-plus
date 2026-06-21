import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composerWidgetSource = readFileSync("src/composerWidget.ts", "utf8");
const quickCaptureSource = readFileSync("src/modal.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const iconPickerSource = readFileSync("src/iconPicker.ts", "utf8");
const savedSearchModalSource = readFileSync("src/savedSearchModal.ts", "utf8");
const projectSendModalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
const sidebarGroupModalSource = readFileSync("src/sidebarGroupModal.ts", "utf8");
const templateManagerModalSource = readFileSync("src/templateManagerModal.ts", "utf8");

describe("mobile interaction stability source", () => {
  it("only reveals the composer for keyboard changes while the composer is the active interaction target", () => {
    expect(composerWidgetSource).toContain("isMobileKeyboardSessionActive");
    expect(composerWidgetSource).toContain("handleDocumentPointer");
    expect(composerWidgetSource).toContain("!this.element.contains(target)");
    expect(composerWidgetSource).toContain("this.mobileKeyboardActive = false");
    expect(composerWidgetSource).toContain("if (!this.isMobileKeyboardSessionActive())");
    expect(composerWidgetSource).toContain("scheduleMobileKeyboardViewportUpdate");
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
  });
});
