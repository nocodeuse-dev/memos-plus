import { describe, expect, it } from "vitest";
import { findExcalidrawEmbedCommand } from "../src/excalidrawCommand";

describe("Excalidraw embed command lookup", () => {
  it("prefers the command that creates a new drawing and embeds it into Markdown", () => {
    const command = findExcalidrawEmbedCommand([
      { id: "obsidian-excalidraw-plugin:open", name: "Excalidraw: Open drawings" },
      { id: "obsidian-excalidraw-plugin:new", name: "Excalidraw: New drawing" },
      {
        id: "obsidian-excalidraw-plugin:autocreate-new-tab",
        name: "Excalidraw: 新建绘图 - 于新面板 - 并嵌入到当前 Markdown 文档中"
      }
    ]);

    expect(command?.id).toBe("obsidian-excalidraw-plugin:autocreate-new-tab");
  });

  it("returns null when no Excalidraw embed command is registered", () => {
    expect(findExcalidrawEmbedCommand([{ id: "editor:insert-link", name: "Insert link" }])).toBeNull();
  });

  it("prefers creating a new drawing in a new pane or window before embedding into Markdown", () => {
    const command = findExcalidrawEmbedCommand([
      {
        id: "obsidian-excalidraw-plugin:embed-existing",
        name: "Excalidraw: 嵌入绘图 ![[drawing]] 到当前 Markdown 文档中"
      },
      {
        id: "obsidian-excalidraw-plugin:autocreate-current-pane",
        name: "Excalidraw: 新建绘图 - 于当前面板 - 并嵌入到当前 Markdown 文档中"
      },
      {
        id: "obsidian-excalidraw-plugin:autocreate-new-pane",
        name: "Excalidraw: 新建绘图 - 于新面板 - 并嵌入到当前 Markdown 文档中"
      }
    ]);

    expect(command?.id).toBe("obsidian-excalidraw-plugin:autocreate-new-pane");
  });

  it("matches the command palette item that creates a new pane and embeds into the active Markdown file", () => {
    const command = findExcalidrawEmbedCommand([
      { id: "obsidian-excalidraw-plugin:new-window", name: "Excalidraw: 新建绘图 - 于新窗口" },
      { id: "obsidian-excalidraw-plugin:new-pane", name: "Excalidraw: 新建绘图 - 于新面板" },
      { id: "obsidian-excalidraw-plugin:new-current-pane", name: "Excalidraw: 新建绘图 - 于当前面板" },
      { id: "obsidian-excalidraw-plugin:open-existing-pane", name: "Excalidraw: 打开已有的绘图 - 于新面板" },
      {
        id: "obsidian-excalidraw-plugin:autocreate-new-pane",
        name: "Excalidraw: 新建绘图 - 于新面板 - 并嵌入到当前 Markdown 文档中"
      },
      {
        id: "obsidian-excalidraw-plugin:autocreate-current-pane",
        name: "Excalidraw: 新建绘图 - 于当前面板 - 并嵌入到当前 Markdown 文档中"
      },
      {
        id: "obsidian-excalidraw-plugin:embed-existing",
        name: "Excalidraw: 嵌入绘图 ![[drawing]] 到当前 Markdown 文档中"
      }
    ]);

    expect(command?.id).toBe("obsidian-excalidraw-plugin:autocreate-new-pane");
  });
});
