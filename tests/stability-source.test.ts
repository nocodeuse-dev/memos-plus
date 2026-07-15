import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const mobilePanelSource = readFileSync("src/mobilePanelView.ts", "utf8");
const excalidrawEmbedSource = readFileSync("src/excalidrawEmbed.ts", "utf8");
const storeSource = readFileSync("src/store.ts", "utf8");

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
    const apiExecutionIndex = excalidrawEmbedSource.indexOf("const executed = await executeExcalidrawPluginApi");

    expect(targetSelectionIndex).toBeGreaterThanOrEqual(0);
    expect(apiExecutionIndex).toBeGreaterThan(targetSelectionIndex);
    expect(excalidrawEmbedSource).toContain("await app.workspace.revealLeaf(leaf);");
    expect(excalidrawEmbedSource).toContain("app.workspace.setActiveLeaf(leaf");
    expect(excalidrawEmbedSource).toContain("await waitForActiveMarkdownFile(app, file);");
    expect(excalidrawEmbedSource).toContain("function waitForWorkspaceFrame(app: App): Promise<void>");
    expect(excalidrawEmbedSource).toContain("leaf.view instanceof MarkdownView");
    expect(excalidrawEmbedSource).toContain("await executeExcalidrawPluginApi(host.app, choice.file);");
    expect(excalidrawEmbedSource).toContain("formatExcalidrawMarkdownInsertion(linkText");
    expect(excalidrawEmbedSource).toContain("currentLine.slice(0, cursor.ch)");
    expect(excalidrawEmbedSource).toContain("currentLine.slice(cursor.ch)");
    expect(excalidrawEmbedSource).toContain('api.openDrawing(drawing, "new-pane", true, undefined, true);');
    expect(excalidrawEmbedSource).not.toContain("executeRegisteredCommand");
    expect(excalidrawEmbedSource).not.toContain("api.embedDrawing");
    expect(excalidrawEmbedSource).toContain('new Notice("无法创建 Excalidraw 链接，请确认 Excalidraw 插件已启用")');
  });

  it("honors delayed mobile task indexing during vault change events", () => {
    expect(mainSource).toContain("Platform.isMobile && this.settings.taskIndexDelayOnMobile");
    expect(mainSource).toContain('this.taskIndex.getStatus().cacheState === "needs-update"');
  });

  it("records the final send-to-file write boundary without logging note content", () => {
    expect(storeSource).toContain('logMemosPlusDiagnostic("file-target:write-start"');
    expect(storeSource).toContain('logMemosPlusDiagnostic("file-target:write-end"');
    expect(storeSource).toContain('logMemosPlusDiagnostic("file-target:write-error"');
    expect(storeSource).toContain("hasHeading: Boolean(target.heading?.trim())");
  });

  it("keeps one plugin-lifetime store and serializes settings writes", () => {
    expect(mainSource.match(/new MemosPlusStore/g)).toHaveLength(1);
    expect(mainSource).toContain("private readonly settingsSaveQueue = new SerialTaskQueue();");
    expect(mainSource).toContain("return this.settingsSaveQueue.run(async () => {");
  });

  it("bounds link-title caching and allows failed requests to retry", () => {
    expect(mainSource).toContain("const LINK_ANALYSIS_TITLE_CACHE_LIMIT = 100;");
    expect(mainSource).toContain("while (this.linkAnalysisTitleCache.size > LINK_ANALYSIS_TITLE_CACHE_LIMIT)");
    expect(mainSource).toContain("this.linkAnalysisTitleCache.delete(url);");
  });
});
