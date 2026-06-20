import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const widgetSource = readFileSync("src/composerWidget.ts", "utf8");

describe("composer image paste handling", () => {
  it("checks external image upload delegation before preventing paste defaults", () => {
    const pasteHandler = widgetSource.slice(widgetSource.indexOf("private async handleComposerPaste"), widgetSource.indexOf("private async handleComposerDrop"));

    expect(widgetSource).toContain("shouldMemosHandleImagePaste");
    expect(pasteHandler.indexOf("shouldMemosHandleImagePaste")).toBeGreaterThanOrEqual(0);
    expect(pasteHandler.indexOf("event.preventDefault()")).toBeGreaterThan(pasteHandler.indexOf("shouldMemosHandleImagePaste"));
  });

  it("checks external image upload delegation before preventing drop defaults", () => {
    const dropHandler = widgetSource.slice(widgetSource.indexOf("private async handleComposerDrop"), widgetSource.indexOf("private showTablePicker"));

    expect(dropHandler.indexOf("shouldMemosHandleImagePaste")).toBeGreaterThanOrEqual(0);
    expect(dropHandler.indexOf("event.preventDefault()")).toBeGreaterThan(dropHandler.indexOf("shouldMemosHandleImagePaste"));
  });
});
