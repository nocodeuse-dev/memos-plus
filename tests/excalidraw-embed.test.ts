import { describe, expect, it } from "vitest";
import { findExcalidrawEmbedCommand } from "../src/excalidrawCommand";
import { formatExcalidrawMarkdownInsertion, formatExcalidrawMarkdownLink } from "../src/excalidrawLink";

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

  it("formats Memos Plus Excalidraw insertions as links instead of embeds", () => {
    expect(formatExcalidrawMarkdownLink("机器人 2026-06-27 20.55.35.excalidraw")).toBe("[[机器人 2026-06-27 20.55.35.excalidraw]]");
    expect(formatExcalidrawMarkdownLink("绘图.excalidraw.md")).not.toMatch(/^!/);
  });

  it("keeps following headings separated when inserting Excalidraw links", () => {
    const insertion = formatExcalidrawMarkdownInsertion("机器人 2026-06-27-21-27-13.excalidraw.md", {
      before: "",
      after: "## 已完成"
    });

    expect(`${insertion}## 已完成`).toBe("[[机器人 2026-06-27-21-27-13.excalidraw.md]]\n\n## 已完成");
  });

  it("keeps Excalidraw links on their own block when the cursor is between text", () => {
    const insertion = formatExcalidrawMarkdownInsertion("绘图.excalidraw.md", {
      before: "前文",
      after: "后文"
    });

    expect(`前文${insertion}后文`).toBe("前文\n\n[[绘图.excalidraw.md]]\n\n后文");
  });
});
