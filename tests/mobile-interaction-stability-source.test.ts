import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composerWidgetSource = readFileSync("src/composerWidget.ts", "utf8");
const quickCaptureSource = readFileSync("src/modal.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");

describe("mobile interaction stability source", () => {
  it("only reveals the composer for keyboard changes while the composer is the active interaction target", () => {
    expect(composerWidgetSource).toContain("isMobileKeyboardSessionActive");
    expect(composerWidgetSource).toContain("handleDocumentPointer");
    expect(composerWidgetSource).toContain("!this.element.contains(target)");
    expect(composerWidgetSource).toContain("this.mobileKeyboardActive = false");
    expect(composerWidgetSource).toContain("if (!this.isMobileKeyboardSessionActive())");
    expect(composerWidgetSource).toContain("scheduleMobileKeyboardViewportUpdate");
  });

  it("keeps quick capture autofocus while preventing sidebar auto-open from focusing input", () => {
    expect(quickCaptureSource).not.toContain("focusAfterIncomingContent");
    expect(quickCaptureSource).toContain("this.composerSession.focus();");

    expect(quickInputSource).not.toContain("focusAfterIncomingContent");
    expect(quickInputSource).not.toContain("this.composerSession.focus();");
    expect(quickInputSource).toContain("focusComposer(): void");
  });
});
