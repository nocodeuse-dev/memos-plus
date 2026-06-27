import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const quickInputSource = readFileSync("src/quickInputView.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
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

  it("catches fire-and-forget composer initial content failures", () => {
    expect(quickInputSource).toContain('this.composerSession.applyInitialContent("auto").catch');
    expect(quickInputSource).toContain('this.composerSession.applyInitialContent("none").catch');
    expect(viewSource).toContain('this.composerSession.applyInitialContent("auto").catch');
  });

  it("guards Excalidraw command execution after target selection", () => {
    expect(excalidrawEmbedSource).toContain("const executed = executeRegisteredCommand(host.app, command.id);");
    expect(excalidrawEmbedSource).toContain('new Notice("无法执行 Excalidraw 嵌入命令，请确认 Excalidraw 插件已启用")');
    expect(excalidrawEmbedSource).toContain("function executeRegisteredCommand(app: App, id: string): boolean");
  });
});
