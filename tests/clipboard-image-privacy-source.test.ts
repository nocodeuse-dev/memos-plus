import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const quickCaptureSource = readFileSync("src/quickCaptureContent.ts", "utf8");
const composerSessionSource = readFileSync("src/composerSession.ts", "utf8");
const widgetSource = readFileSync("src/composerWidget.ts", "utf8");

describe("clipboard image privacy boundaries", () => {
  it("opening the sidebar never calls readClipboardImage", () => {
    const sidebarOpen = quickInputSource.slice(
      quickInputSource.indexOf("private applySidebarInitialContent"),
      quickInputSource.indexOf("private renderHeaderActions")
    );
    expect(sidebarOpen).not.toContain("readClipboardImage");
    expect(sidebarOpen).toContain('applyInitialContent("auto")');
  });

  it("automatic clipboard detection reads text only", () => {
    const applyInitial = composerSessionSource.slice(
      composerSessionSource.indexOf("const applyInitialContent"),
      composerSessionSource.indexOf("return {", composerSessionSource.indexOf("const applyInitialContent"))
    );
    expect(applyInitial).toContain("readClipboardText");
    expect(applyInitial).not.toContain("readClipboardImage");
    expect(quickCaptureSource).not.toContain("options.readClipboardImage");
    expect(quickCaptureSource).not.toContain('"clipboard-image"');
  });

  it("plugin startup and quick-input reload contain no image-save path", () => {
    const onload = mainSource.slice(mainSource.indexOf("async onload"), mainSource.indexOf("onunload"));
    const reload = quickInputSource.slice(quickInputSource.indexOf("async reload"), quickInputSource.indexOf("focusComposer"));
    expect(onload).not.toContain("readClipboardImageSafely");
    expect(onload).not.toContain("insertConfirmedClipboardImage");
    expect(reload).not.toContain("readClipboardImage");
    expect(reload).not.toContain("handleImageFile");
  });

  it("keeps manual paste, file picker, and drag-drop as authorized image actions", () => {
    expect(widgetSource).toContain('this.handleImageFile(file, "paste")');
    expect(widgetSource).toContain('this.handleImageFile(file, "file-picker")');
    expect(widgetSource).toContain('this.handleImageFile(file, "drop")');
  });

  it("exposes clipboard image reading only behind the confirmed command", () => {
    const importCommand = mainSource.slice(mainSource.indexOf("private async importClipboardImage"), mainSource.indexOf("private handleMemosPlusProtocol"));
    expect(mainSource).toContain('id: "import-clipboard-image"');
    expect(importCommand).toContain("importClipboardImageWithConfirmation");
    expect(importCommand).toContain("confirmWithModal");
    expect(importCommand).toContain("readClipboardImageSafely");
  });
});
