import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import {
  collectMetadataTags,
  getFileHeadings,
  getTaggedFileInfos,
  insertContentAtFileTarget,
  searchMarkdownFileInfos,
  updateRecentFileTargetPaths
} from "../src/fileSend";

vi.mock("obsidian", () => {
  class TFile {
    basename: string;
    extension = "md";
    stat = { mtime: 0 };

    constructor(readonly path: string, readonly name = path.split("/").pop() ?? path, mtime = 0) {
      this.basename = name.replace(/\.md$/i, "");
      this.stat.mtime = mtime;
    }
  }

  return {
    App: class {},
    Notice: class {},
    PluginSettingTab: class {},
    Setting: class {},
    TFile,
    TFolder: class {},
    getAllTags: (cache: { tags?: Array<{ tag: string }> }) => cache.tags?.map((item) => item.tag) ?? null,
    normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
  };
});

function makeTFile(path: string, mtime = 0): TFile {
  const FileCtor = TFile as unknown as new (path: string, name?: string, mtime?: number) => TFile;
  return new FileCtor(path, path.split("/").pop() ?? path, mtime);
}

function createApp(
  files: Record<string, string>,
  caches: Record<string, unknown> = {},
  mtimes: Record<string, number> = {}
) {
  const fileObjects = Object.keys(files).map((path) => makeTFile(path, mtimes[path] ?? 0));
  const app = {
    vault: {
      getMarkdownFiles: vi.fn(() => fileObjects),
      getAbstractFileByPath: vi.fn((path: string) => fileObjects.find((file) => file.path === path) ?? null),
      read: vi.fn(async (file: TFile) => files[file.path] ?? ""),
      process: vi.fn(async (file: TFile, updater: (source: string) => string) => {
        files[file.path] = updater(files[file.path] ?? "");
      })
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile) => caches[file.path] ?? null)
    }
  };
  return { app, files, fileObjects };
}

describe("file send helpers", () => {
  it("collects tags from frontmatter arrays, frontmatter strings, and body tags", () => {
    expect(
      collectMetadataTags({
        frontmatter: { tags: ["#病", " 医学/疾病 ", "插件 病例"] },
        tags: [{ tag: "#康复" }, { tag: "#项目/插件" }]
      } as never)
    ).toEqual(["病", "医学/疾病", "插件", "病例", "康复", "项目/插件"]);
  });

  it("finds tagged files by fuzzy tag text without reading file bodies", async () => {
    const { app } = createApp(
      {
        "医学/肩袖损伤.md": "# 肩袖损伤\n",
        "插件/Memos Plus.md": "# Memos Plus\n",
        "普通/无关.md": "# 无关\n"
      },
      {
        "医学/肩袖损伤.md": { frontmatter: { tags: ["医学/疾病", "肩关节"] }, tags: [{ tag: "#病历" }] },
        "插件/Memos Plus.md": { frontmatter: { tags: ["插件"] }, tags: [{ tag: "#项目/插件" }] },
        "普通/无关.md": { frontmatter: { tags: ["生活"] } }
      },
      {
        "医学/肩袖损伤.md": 30,
        "插件/Memos Plus.md": 20
      }
    );

    const files = await getTaggedFileInfos(app as never, "病");

    expect(files.map((info) => [info.path, info.matchTags])).toEqual([
      ["医学/肩袖损伤.md", ["医学/疾病", "病历"]]
    ]);
    expect(app.vault.read).not.toHaveBeenCalled();
  });

  it("searches markdown files by name or path and includes cached tags", async () => {
    const { app } = createApp(
      {
        "医学/肩袖损伤.md": "",
        "插件/Memos Plus.md": "",
        "普通/无关.md": ""
      },
      {
        "医学/肩袖损伤.md": { frontmatter: { tags: ["病"] } },
        "插件/Memos Plus.md": { frontmatter: { tags: ["插件"] } }
      },
      {
        "医学/肩袖损伤.md": 10,
        "插件/Memos Plus.md": 20
      }
    );

    const files = await searchMarkdownFileInfos(app as never, "plus");

    expect(files.map((info) => [info.name, info.tags])).toEqual([["Memos Plus", ["插件"]]]);
  });

  it("uses metadataCache headings before reading a file", async () => {
    const { app, fileObjects } = createApp(
      {
        "医学/肩袖损伤.md": "# 肩袖损伤\n\n## 诊断\n"
      },
      {
        "医学/肩袖损伤.md": {
          headings: [
            { heading: "肩袖损伤", level: 1, position: { start: { line: 0 } } },
            { heading: "临床表现", level: 2, position: { start: { line: 5 } } },
            { heading: "保守治疗", level: 3, position: { start: { line: 8 } } }
          ]
        }
      }
    );

    const headings = await getFileHeadings(app as never, fileObjects[0]);

    expect(headings.map((heading) => `${heading.level}:${heading.heading}:${heading.line}`)).toEqual([
      "1:肩袖损伤:0",
      "2:临床表现:5",
      "3:保守治疗:8"
    ]);
    expect(app.vault.read).not.toHaveBeenCalled();
  });

  it("falls back to parsing markdown headings when metadataCache has none", async () => {
    const { app, fileObjects } = createApp({
      "医学/肩袖损伤.md": "# 肩袖损伤\n\n## 临床表现\n\n### 保守治疗\n\n正文\n"
    });

    const headings = await getFileHeadings(app as never, fileObjects[0]);

    expect(headings.map((heading) => `${heading.level}:${heading.heading}:${heading.line}`)).toEqual([
      "1:肩袖损伤:0",
      "2:临床表现:2",
      "3:保守治疗:4"
    ]);
  });

  it("inserts content at the top of a selected heading", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/肩袖损伤.md": "# 肩袖损伤\n\n## 临床表现\n\n旧表现\n\n## 治疗\n\n旧治疗\n"
    });

    await insertContentAtFileTarget(app as never, fileObjects[0], { heading: "临床表现", position: "heading-top" }, "> [!note]- 新表现\n> 内容");

    expect(files["医学/肩袖损伤.md"]).toBe("# 肩袖损伤\n\n## 临床表现\n\n> [!note]- 新表现\n> 内容\n\n旧表现\n\n## 治疗\n\n旧治疗\n");
  });

  it("inserts content at the bottom of a selected heading before the next sibling heading", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/肩袖损伤.md": "# 肩袖损伤\n\n## 临床表现\n\n旧表现\n\n### 细节\n\n旧细节\n\n## 治疗\n\n旧治疗\n"
    });

    await insertContentAtFileTarget(app as never, fileObjects[0], { heading: "临床表现", position: "heading-bottom" }, "- 新表现");

    expect(files["医学/肩袖损伤.md"]).toBe("# 肩袖损伤\n\n## 临床表现\n\n旧表现\n\n### 细节\n\n旧细节\n\n- 新表现\n\n## 治疗\n\n旧治疗\n");
  });

  it("supports file start and file end insertion when no heading is selected", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/无标题.md": "旧内容\n"
    });

    await insertContentAtFileTarget(app as never, fileObjects[0], { position: "file-start" }, "开头");
    await insertContentAtFileTarget(app as never, fileObjects[0], { position: "file-end" }, "结尾");

    expect(files["医学/无标题.md"]).toBe("开头\n\n旧内容\n\n结尾\n");
  });

  it("inserts at file start after YAML frontmatter when present", async () => {
    const { app, files, fileObjects } = createApp({
      "项目/有属性.md": "---\ntags:\n  - 项目\ncreated: 2026-06-16\n---\n\n# 标题\n\n正文\n"
    });

    await insertContentAtFileTarget(app as never, fileObjects[0], { position: "file-start" }, "新插入内容");

    expect(files["项目/有属性.md"]).toBe("---\ntags:\n  - 项目\ncreated: 2026-06-16\n---\n\n新插入内容\n\n# 标题\n\n正文\n");
  });

  it("creates a missing heading before inserting content when requested", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/无标题.md": "旧内容\n"
    });

    await insertContentAtFileTarget(app as never, fileObjects[0], { heading: "收集箱", position: "heading-top", createHeadingIfMissing: true }, "新资料");

    expect(files["医学/无标题.md"]).toBe("旧内容\n\n## 收集箱\n\n新资料\n");
  });

  it("creates a configured heading at the file end before inserting content", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/训练.md": "# 肩袖损伤\n\n旧内容\n"
    });

    await insertContentAtFileTarget(
      app as never,
      fileObjects[0],
      {
        position: "new-heading",
        newHeadingName: "康复训练",
        newHeadingLevel: 2,
        newHeadingPosition: "file-end"
      },
      "弹力带外旋"
    );

    expect(files["医学/训练.md"]).toBe("# 肩袖损伤\n\n旧内容\n\n## 康复训练\n\n弹力带外旋\n");
  });

  it("creates a heading after YAML frontmatter when the new heading position is file start", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/训练.md": "---\ntags:\n  - 病\n---\n\n# 肩袖损伤\n\n旧内容\n"
    });

    await insertContentAtFileTarget(
      app as never,
      fileObjects[0],
      {
        position: "new-heading",
        newHeadingName: "康复训练",
        newHeadingLevel: 3,
        newHeadingPosition: "file-start"
      },
      "弹力带外旋"
    );

    expect(files["医学/训练.md"]).toBe("---\ntags:\n  - 病\n---\n\n### 康复训练\n\n弹力带外旋\n\n# 肩袖损伤\n\n旧内容\n");
  });

  it("uses an existing same-name heading by default for new-heading insertion", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/训练.md": "# 肩袖损伤\n\n## 康复训练\n\n旧训练\n"
    });

    await insertContentAtFileTarget(
      app as never,
      fileObjects[0],
      {
        position: "new-heading",
        newHeadingName: "康复训练",
        newHeadingLevel: 2,
        newHeadingPosition: "file-end"
      },
      "新训练"
    );

    expect(files["医学/训练.md"]).toBe("# 肩袖损伤\n\n## 康复训练\n\n新训练\n\n旧训练\n");
  });

  it("can still create a duplicate same-name heading or cancel insertion", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/训练.md": "# 肩袖损伤\n\n## 康复训练\n\n旧训练\n"
    });

    await insertContentAtFileTarget(
      app as never,
      fileObjects[0],
      {
        position: "new-heading",
        newHeadingName: "康复训练",
        newHeadingLevel: 2,
        newHeadingPosition: "file-end",
        existingHeadingBehavior: "create-duplicate"
      },
      "新训练"
    );
    await insertContentAtFileTarget(
      app as never,
      fileObjects[0],
      {
        position: "new-heading",
        newHeadingName: "康复训练",
        newHeadingLevel: 2,
        newHeadingPosition: "file-end",
        existingHeadingBehavior: "cancel"
      },
      "不应插入"
    );

    expect(files["医学/训练.md"]).toBe("# 肩袖损伤\n\n## 康复训练\n\n旧训练\n\n## 康复训练\n\n新训练\n");
  });

  it("can create a new heading after the currently selected heading section", async () => {
    const { app, files, fileObjects } = createApp({
      "医学/训练.md": "# 肩袖损伤\n\n## 治疗\n\n旧治疗\n\n### 保守治疗\n\n旧保守\n\n## 参考资料\n\n旧参考\n"
    });

    await insertContentAtFileTarget(
      app as never,
      fileObjects[0],
      {
        heading: "治疗",
        position: "new-heading",
        newHeadingName: "康复训练",
        newHeadingLevel: 2,
        newHeadingPosition: "after-current-heading"
      },
      "弹力带外旋"
    );

    expect(files["医学/训练.md"]).toBe(
      "# 肩袖损伤\n\n## 治疗\n\n旧治疗\n\n### 保守治疗\n\n旧保守\n\n## 康复训练\n\n弹力带外旋\n\n## 参考资料\n\n旧参考\n"
    );
  });

  it("keeps a short recent file target list without duplicates", () => {
    expect(updateRecentFileTargetPaths(["A.md", "B.md"], "B.md", 3)).toEqual(["B.md", "A.md"]);
    expect(updateRecentFileTargetPaths(["A.md", "B.md", "C.md"], "D.md", 3)).toEqual(["D.md", "A.md", "B.md"]);
  });
});
