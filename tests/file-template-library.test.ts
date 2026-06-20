import { describe, expect, it, vi } from "vitest";
import {
  buildFileTemplateTargetPath,
  filterFileTemplateLibraryItems,
  normalizeFileTemplateDefaults,
  normalizeFileTemplateLibraryPaths,
  renderFileTemplateContent,
  type FileTemplateLibraryItem
} from "../src/fileTemplateLibrary";

vi.mock("obsidian", () => ({
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

const items: FileTemplateLibraryItem[] = [
  {
    path: "我的资源/模板/疾病/疾病模板.md",
    name: "疾病模板",
    category: "疾病",
    tags: ["病", "医学"],
    updatedAt: 100,
    isFavorite: true,
    isRecent: false
  },
  {
    path: "我的资源/模板/项目模板.md",
    name: "项目模板",
    category: "未分类",
    tags: ["项目"],
    updatedAt: 200,
    isFavorite: false,
    isRecent: true
  }
];

describe("file template library", () => {
  it("normalizes favorite and recent template paths", () => {
    expect(normalizeFileTemplateLibraryPaths([" 我的资源//模板/疾病.md ", "", "我的资源/模板/疾病.md"])).toEqual([
      "我的资源/模板/疾病.md"
    ]);
  });

  it("normalizes default template mappings by tag", () => {
    expect(
      normalizeFileTemplateDefaults({
        " #病 ": " 我的资源//模板/疾病.md ",
        "": "empty.md",
        项目: ""
      })
    ).toEqual({ 病: "我的资源/模板/疾病.md" });
  });

  it("filters templates by category, name, and tags", () => {
    expect(filterFileTemplateLibraryItems(items, { query: "病", category: "全部" }).map((item) => item.name)).toEqual(["疾病模板"]);
    expect(filterFileTemplateLibraryItems(items, { query: "医学", category: "疾病" }).map((item) => item.name)).toEqual(["疾病模板"]);
    expect(filterFileTemplateLibraryItems(items, { query: "", category: "收藏" }).map((item) => item.name)).toEqual(["疾病模板"]);
    expect(filterFileTemplateLibraryItems(items, { query: "", category: "最近" }).map((item) => item.name)).toEqual(["项目模板"]);
  });

  it("renders markdown template variables without exposing code in the UI layer", () => {
    expect(
      renderFileTemplateContent("# {{title}}\n\n标签：{{tag}}\n日期：{{date}}\n{{content}}", {
        title: "肩袖损伤",
        tag: "病",
        content: "冈上肌腱疼痛",
        folder: "我的资源/疾病",
        now: new Date(2026, 5, 16, 9, 8, 0)
      })
    ).toBe("# 肩袖损伤\n\n标签：病\n日期：2026-06-16\n冈上肌腱疼痛\n");
  });

  it("adds the current tag to plain Markdown templates without requiring frontmatter code", () => {
    const rendered = renderFileTemplateContent("# {{title}}\n\n## 收集箱\n", {
      title: "肩袖损伤",
      tag: "病",
      now: new Date(2026, 5, 16, 9, 8, 0)
    });

    expect(rendered).toContain("tags:\n  - 病");
    expect(rendered).toContain("# 肩袖损伤");
  });

  it("builds a unique markdown target path from the selected save folder and search title", () => {
    expect(buildFileTemplateTargetPath("我的资源/疾病", "肩袖/损伤")).toBe("我的资源/疾病/肩袖 损伤.md");
  });
});
