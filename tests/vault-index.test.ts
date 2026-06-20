import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { VaultMetadataIndex } from "../src/vaultIndex";

vi.mock("obsidian", () => {
  class TFile {
    basename: string;
    extension = "md";
    stat: { mtime: number };

    constructor(readonly path: string, readonly name = path.split("/").pop() ?? path, mtime = 0) {
      this.basename = name.replace(/\.md$/i, "");
      this.stat = { mtime };
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

function createApp(caches: Record<string, unknown>, mtimes: Record<string, number> = {}) {
  const fileObjects = Object.keys(caches).map((path) => makeTFile(path, mtimes[path] ?? 0));
  const app = {
    vault: {
      getMarkdownFiles: vi.fn(() => fileObjects),
      getAbstractFileByPath: vi.fn((path: string) => fileObjects.find((file) => file.path === path) ?? null),
      read: vi.fn()
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile) => caches[file.path] ?? null)
    }
  };
  return { app, fileObjects };
}

describe("VaultMetadataIndex", () => {
  it("builds a reusable metadata index for files, tags, projects, headings, and template library items", () => {
    const { app } = createApp(
      {
        "我的资源/Memos/memos plus.md": {
          frontmatter: { tags: ["项目", "软件"], status: "进行中" },
          tags: [{ tag: "#Obsidian" }],
          headings: [{ heading: "收集箱", level: 2, position: { start: { line: 8 } } }]
        },
        "我的资源/模板/疾病/疾病模板.md": {
          frontmatter: { tags: ["病", "医学"] },
          tags: [{ tag: "#模板" }]
        },
        "我的资源/笔记库/肩袖损伤.md": {
          frontmatter: { tags: ["医学/疾病"] },
          tags: [{ tag: "#病" }]
        }
      },
      {
        "我的资源/Memos/memos plus.md": 30,
        "我的资源/模板/疾病/疾病模板.md": 20,
        "我的资源/笔记库/肩袖损伤.md": 10
      }
    );
    const index = new VaultMetadataIndex(app as never);

    expect(index.getAllTagOptions()).toEqual(["病", "模板", "软件", "项目", "医学", "医学/疾病", "Obsidian"]);
    expect(index.getProjectInfos("项目", { recentProjectPaths: ["我的资源/Memos/memos plus.md"], showArchivedProjects: false })).toMatchObject([
      {
        name: "memos plus",
        status: "进行中",
        isRecent: true
      }
    ]);
    expect(index.getTaggedFileInfos("病").map((info) => [info.path, info.matchTags])).toEqual([
      ["我的资源/模板/疾病/疾病模板.md", ["病"]],
      ["我的资源/笔记库/肩袖损伤.md", ["医学/疾病", "病"]]
    ]);
    expect(index.searchMarkdownFileInfos("plus").map((info) => info.path)).toEqual(["我的资源/Memos/memos plus.md"]);
    expect(index.getRecentFileInfos(["我的资源/Memos/memos plus.md"]).map((info) => info.name)).toEqual(["memos plus"]);
    expect(index.getFileHeadings("我的资源/Memos/memos plus.md")).toEqual([{ heading: "收集箱", level: 2, line: 8 }]);
    expect(index.scanFileTemplateLibrary({
      fileTemplateLibraryFolder: "我的资源/模板",
      fileTemplateLibraryDefaultFolder: "我的资源/Memos",
      fileTemplateLibraryFavorites: ["我的资源/模板/疾病/疾病模板.md"],
      fileTemplateLibraryRecent: [],
      fileTemplateLibraryDefaults: {}
    }).map((item) => [item.name, item.category, item.tags, item.isFavorite])).toEqual([
      ["疾病模板", "疾病", ["病", "模板", "医学"], true]
    ]);
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
  });

  it("invalidates one changed file without forcing immediate full rebuild", () => {
    const { app, fileObjects } = createApp({
      "A.md": { frontmatter: { tags: ["旧"] } },
      "B.md": { frontmatter: { tags: ["保留"] } }
    });
    const index = new VaultMetadataIndex(app as never);

    expect(index.getAllTagOptions()).toEqual(["保留", "旧"]);
    (app.metadataCache.getFileCache as ReturnType<typeof vi.fn>).mockImplementation((file: TFile) => {
      if (file.path === "A.md") {
        return { frontmatter: { tags: ["新"] } };
      }
      return { frontmatter: { tags: ["保留"] } };
    });

    index.invalidate("A.md");

    expect(index.getEntry(fileObjects[0])?.tags).toEqual(["新"]);
    expect(index.getAllTagOptions()).toEqual(["保留", "新"]);
    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
  });
});
