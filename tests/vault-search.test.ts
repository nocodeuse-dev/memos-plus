import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { VaultSavedSearchIndex } from "../src/vaultSearch";
import { VaultMetadataIndex } from "../src/vaultIndex";
import type { SavedSearch } from "../src/savedSearch";

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
    TFile,
    getAllTags: (cache: { tags?: Array<{ tag: string }> }) => cache.tags?.map((item) => item.tag) ?? [],
    normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
  };
});

function makeTFile(path: string, mtime = new Date(2026, 5, 14, 10, 30).getTime()): TFile {
  const FileCtor = TFile as unknown as new (path: string, name?: string, mtime?: number) => TFile;
  return new FileCtor(path, path.split("/").pop() ?? path, mtime);
}

function createApp(files: Record<string, string>, caches: Record<string, unknown>) {
  const fileObjects = Object.keys(files).map((path, index) => makeTFile(path, new Date(2026, 5, 14, 10, 30 + index).getTime()));
  const app = {
    vault: {
      getMarkdownFiles: vi.fn(() => fileObjects),
      read: vi.fn(async (file: TFile) => files[file.path] ?? "")
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile) => caches[file.path] ?? {})
    }
  };
  return { app, fileObjects };
}

function search(conditions: SavedSearch["conditions"]): SavedSearch {
  return {
    id: "search",
    name: "全库检索式",
    match: "all",
    searchScope: "vault",
    conditions
  };
}

describe("VaultSavedSearchIndex", () => {
  it("matches project files by cached tags without reading file bodies", async () => {
    const { app } = createApp(
      {
        "项目/A.md": "# A\n#项目 #进行中\n",
        "项目/B.md": "# B\n#项目 #归档\n",
        "普通/C.md": "# C\n"
      },
      {
        "项目/A.md": { frontmatter: { tags: ["项目", "进行中"] }, tags: [{ tag: "#项目" }, { tag: "#进行中" }] },
        "项目/B.md": { frontmatter: { tags: ["项目", "归档"] }, tags: [{ tag: "#项目" }, { tag: "#归档" }] },
        "普通/C.md": { frontmatter: { tags: ["普通"] }, tags: [{ tag: "#普通" }] }
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    const results = await index.search(
      search([
        { field: "tag", operator: "contains", value: "项目" },
        { field: "tag", operator: "contains", value: "进行中" }
      ])
    );

    expect(results.map((result) => result.path)).toEqual(["项目/A.md"]);
    expect(results[0].tags).toEqual(["项目", "进行中"]);
    expect(app.vault.read).not.toHaveBeenCalled();
  });

  it("searches file name, path, frontmatter, and body text when using text conditions", async () => {
    const { app } = createApp(
      {
        "项目/Memos Plus.md": "# Memos Plus\n需要全库搜索\n",
        "项目/门诊病历.md": "# 门诊病历\n移动端输入\n"
      },
      {
        "项目/Memos Plus.md": { frontmatter: { tags: ["项目"], status: "进行中" }, tags: [{ tag: "#项目" }] },
        "项目/门诊病历.md": { frontmatter: { tags: ["项目"], status: "暂停" }, tags: [{ tag: "#项目" }] }
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    const results = await index.search(
      search([
        { field: "tag", operator: "equals", value: "项目" },
        { field: "text", operator: "contains", value: "全库搜索" }
      ])
    );

    expect(results.map((result) => result.title)).toEqual(["Memos Plus"]);
    expect(results[0].excerpt).toContain("需要全库搜索");
    expect(app.vault.read).toHaveBeenCalledTimes(2);
  });

  it("narrows text body reads with metadata conditions before reading content", async () => {
    const { app } = createApp(
      {
        "项目/Memos Plus.md": "# Memos Plus\n需要全库搜索\n",
        "项目/其他项目.md": "# 其他项目\n没有目标词\n",
        "普通/跳过.md": "# 跳过\n需要全库搜索\n"
      },
      {
        "项目/Memos Plus.md": { frontmatter: { tags: ["项目"] }, tags: [{ tag: "#项目" }] },
        "项目/其他项目.md": { frontmatter: { tags: ["项目"] }, tags: [{ tag: "#项目" }] },
        "普通/跳过.md": { frontmatter: { tags: ["普通"] }, tags: [{ tag: "#普通" }] }
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    const results = await index.search(
      search([
        { field: "tag", operator: "equals", value: "项目" },
        { field: "text", operator: "contains", value: "全库搜索" }
      ])
    );

    expect(results.map((result) => result.path)).toEqual(["项目/Memos Plus.md"]);
    expect(app.vault.read).toHaveBeenCalledTimes(2);
    expect(app.vault.read).not.toHaveBeenCalledWith(expect.objectContaining({ path: "普通/跳过.md" }));
  });

  it("reuses cached file content while mtime is unchanged", async () => {
    const { app } = createApp(
      {
        "项目/A.md": "# A\n全库搜索\n"
      },
      {
        "项目/A.md": { frontmatter: { tags: ["项目"] }, tags: [{ tag: "#项目" }] }
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    await index.search(search([{ field: "text", operator: "contains", value: "全库搜索" }]));
    await index.search(search([{ field: "text", operator: "contains", value: "全库搜索" }]));

    expect(app.vault.read).toHaveBeenCalledTimes(1);
  });

  it("stops reading pure text search content after the requested result limit", async () => {
    const { app } = createApp(
      {
        "资料/A.md": "needle\n",
        "资料/B.md": "needle\n",
        "资料/C.md": "needle\n",
        "资料/D.md": "needle\n"
      },
      {
        "资料/A.md": {},
        "资料/B.md": {},
        "资料/C.md": {},
        "资料/D.md": {}
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    const results = await index.search(search([{ field: "text", operator: "contains", value: "needle" }]), {}, { maxResults: 2 });

    expect(results.map((result) => result.path)).toEqual(["资料/D.md", "资料/C.md"]);
    expect(app.vault.read).toHaveBeenCalledTimes(2);
  });

  it("caps pure text search content reads even when there are no matches", async () => {
    const { app } = createApp(
      {
        "资料/A.md": "alpha\n",
        "资料/B.md": "beta\n",
        "资料/C.md": "gamma\n",
        "资料/D.md": "delta\n"
      },
      {
        "资料/A.md": {},
        "资料/B.md": {},
        "资料/C.md": {},
        "资料/D.md": {}
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    const results = await index.search(search([{ field: "text", operator: "contains", value: "needle" }]), {}, { maxContentReads: 2 });

    expect(results).toEqual([]);
    expect(app.vault.read).toHaveBeenCalledTimes(2);
  });

  it("returns matching task details for full-vault task filters", async () => {
    const { app } = createApp(
      {
        "项目/Memos Plus.md": [
          "# Memos Plus",
          "- [ ] 写任务检索 ⏫ 📅 2026-06-17 🔁",
          "- [ ] 明天任务 ⏫ 📅 2026-06-18",
          "- [x] 完成任务 ⏫ 📅 2026-06-17"
        ].join("\n"),
        "项目/其他.md": "- [ ] 低优先级 📅 2026-06-17 🔽\n",
        "普通/跳过.md": "- [ ] 写任务检索 ⏫ 📅 2026-06-17 🔁\n"
      },
      {
        "项目/Memos Plus.md": { frontmatter: { tags: ["项目"] }, tags: [{ tag: "#项目" }] },
        "项目/其他.md": { frontmatter: { tags: ["项目"] }, tags: [{ tag: "#项目" }] },
        "普通/跳过.md": { frontmatter: { tags: ["普通"] }, tags: [{ tag: "#普通" }] }
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    const results = await index.search(
      search([
        { field: "tag", operator: "equals", value: "项目" },
        { field: "taskStatus", operator: "equals", value: "open" },
        { field: "taskPriority", operator: "equals", value: "high" },
        { field: "taskDueDate", operator: "equals", value: "$today" },
        { field: "taskRecurring", operator: "exists" }
      ]),
      { today: "2026-06-17" }
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      path: "项目/Memos Plus.md",
      excerpt: "写任务检索 ⏫ 📅 2026-06-17 🔁",
      task: {
        text: "写任务检索 ⏫ 📅 2026-06-17 🔁",
        completed: false,
        priority: "high",
        dueDate: "2026-06-17",
        recurring: true
      }
    });
    expect(app.vault.read).toHaveBeenCalledTimes(2);
    expect(app.vault.read).not.toHaveBeenCalledWith(expect.objectContaining({ path: "普通/跳过.md" }));
  });

  it("does not read file bodies for image or link existence conditions", async () => {
    const { app } = createApp(
      {
        "资料/图片.md": "![x](local.png)\nhttps://example.com\n"
      },
      {
        "资料/图片.md": {
          embeds: [{ link: "local.png" }],
          links: [{ link: "Other" }],
          frontmatter: { tags: ["资料"] },
          tags: [{ tag: "#资料" }]
        }
      }
    );
    const index = new VaultSavedSearchIndex(app as never);

    const results = await index.search(
      search([
        { field: "image", operator: "exists" },
        { field: "link", operator: "exists" }
      ])
    );

    expect(results.map((result) => result.path)).toEqual(["资料/图片.md"]);
    expect(app.vault.read).not.toHaveBeenCalled();
  });

  it("reuses a warmed VaultMetadataIndex for metadata-only searches without rescanning metadata", async () => {
    const { app } = createApp(
      {
        "项目/A.md": "# A\n#项目\n",
        "普通/B.md": "# B\n"
      },
      {
        "项目/A.md": { frontmatter: { tags: ["项目"], status: "进行中" }, tags: [{ tag: "#项目" }] },
        "普通/B.md": { frontmatter: { tags: ["普通"] }, tags: [{ tag: "#普通" }] }
      }
    );
    const metadataIndex = new VaultMetadataIndex(app as never);
    metadataIndex.getEntries();
    app.vault.getMarkdownFiles.mockClear();
    app.metadataCache.getFileCache.mockClear();
    const index = new VaultSavedSearchIndex(app as never, metadataIndex);

    const results = await index.search(
      search([
        { field: "tag", operator: "equals", value: "项目" },
        { field: "status", operator: "contains", value: "进行中" }
      ])
    );

    expect(results.map((result) => result.path)).toEqual(["项目/A.md"]);
    expect(app.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(app.metadataCache.getFileCache).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
  });
});
