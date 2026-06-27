import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const mobilePanelSource = readFileSync("src/mobilePanelView.ts", "utf8");
const excalidrawEmbedSource = readFileSync("src/excalidrawEmbed.ts", "utf8");

describe("stability guardrails", () => {
  it("awaits workspace reveal calls inside async view activation flows", () => {
    for (const line of [
      "await this.app.workspace.revealLeaf(existing);",
      "await this.app.workspace.revealLeaf(leaf);"
    ]) {
      expect(mainSource).toContain(line);
    }
  });

  it("actively selects the mobile target picker leaf so the first tap reaches controls", () => {
    const mobileTargetBlock = mainSource.match(/async selectProjectTargetOnMobile[\s\S]*?\n {2}\}/)?.[0] ?? "";

    expect(mobileTargetBlock).toContain("await this.app.workspace.revealLeaf(leaf);");
    expect(mobileTargetBlock).toContain("this.app.workspace.setActiveLeaf(leaf");
    expect(mobileTargetBlock).toContain("await leaf.view.prepareForImmediateInteraction();");
  });

  it("catches fire-and-forget composer initial content failures", () => {
    expect(quickInputSource).toContain('this.composerSession.applyInitialContent("auto").catch');
    expect(quickInputSource).toContain('this.composerSession.applyInitialContent("none").catch');
    expect(viewSource).toContain('this.composerSession.applyInitialContent("auto").catch');
  });

  it("wraps command callbacks and void UI callbacks without returning promises", () => {
    expect(mainSource).not.toContain("callback: async");
    expect(mainSource).toContain("private runAsyncOperation");
    expect(mainSource).toContain('this.runAsyncOperation("focus composer"');
    expect(viewSource).toContain('void this.createGroup("").catch');
    expect(mobilePanelSource).toContain("() => void this.renderHeadingPicker(info).catch");
  });

  it("guards Excalidraw command execution after target selection", () => {
    const targetSelectionIndex = excalidrawEmbedSource.indexOf("const choice = await selectProjectTarget");
    const commandLookupIndex = excalidrawEmbedSource.indexOf("const command = findRegisteredExcalidrawEmbedCommand");

    expect(targetSelectionIndex).toBeGreaterThanOrEqual(0);
    expect(commandLookupIndex).toBeGreaterThan(targetSelectionIndex);
    expect(excalidrawEmbedSource).toContain("await app.workspace.revealLeaf(leaf);");
    expect(excalidrawEmbedSource).toContain("app.workspace.setActiveLeaf(leaf");
    expect(excalidrawEmbedSource).toContain("leaf.view instanceof MarkdownView");
    expect(excalidrawEmbedSource).toContain("const executed = executeRegisteredCommand(host.app, command.id);");
    expect(excalidrawEmbedSource).toContain('new Notice("无法执行 Excalidraw 嵌入命令，请确认 Excalidraw 插件已启用")');
    expect(excalidrawEmbedSource).toContain("function executeRegisteredCommand(app: App, id: string): boolean");
  });
});
