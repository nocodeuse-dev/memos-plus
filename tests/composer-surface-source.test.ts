import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const widgetSource = readFileSync("src/composerWidget.ts", "utf8");
const sessionSource = readFileSync("src/composerSession.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const modalSource = readFileSync("src/modal.ts", "utf8");

describe("composer surface routing", () => {
  it("passes an explicit surface from every shared composer entry point", () => {
    expect(widgetSource).toContain('export type ComposerSurface = "home" | "mobileHome" | "sidebar" | "quickCaptureModal"');
    expect(sessionSource).toContain("surface?: ComposerSurface");
    expect(sessionSource).toContain('surface: options.surface ?? "home"');
    expect(viewSource).toContain('this.renderComposer(main, Platform.isMobile ? "mobileHome" : "home")');
    expect(viewSource).toContain('this.renderComposer(home, "mobileHome")');
    expect(quickInputSource).toContain('surface: "sidebar"');
    expect(modalSource).toContain('surface: "quickCaptureModal"');
  });

  it("uses the explicit surface to choose mobile keyboard containers", () => {
    expect(widgetSource).toContain("private readonly surface: ComposerSurface");
    expect(widgetSource).toContain("switch (this.surface)");
    expect(widgetSource).toContain('case "quickCaptureModal"');
    expect(widgetSource).toContain('case "sidebar"');
    expect(widgetSource).toContain('case "mobileHome"');
    expect(widgetSource).toContain('case "home"');
    expect(widgetSource).toContain(".memos-plus-quick-input-view");
    expect(widgetSource).toContain(".memos-plus-quick-capture-modal");
    expect(widgetSource).toContain(".memos-plus-view");
  });
});
