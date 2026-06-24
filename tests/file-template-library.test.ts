import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FILE_TEMPLATE_LIBRARY_INTERACTION,
  FILE_TEMPLATE_LIBRARY_TAB_ALL,
  FILE_TEMPLATE_LIBRARY_TAB_FAVORITE,
  FILE_TEMPLATE_LIBRARY_TAB_RECENT,
  DEFAULT_FILE_TEMPLATE_TAB_INTERACTION,
  buildFileTemplateTargetPath,
  addTemplatePathToFileTemplateTab,
  filterFileTemplateLibraryItemsForTab,
  filterFileTemplateLibraryItems,
  getFileTemplateLibraryCategoryTabId,
  getFileTemplateLibraryTemplateGroupTab,
  getFileTemplateLibraryTemplateGroupTabId,
  getVisibleFileTemplateLibraryTabIds,
  normalizeFileTemplateDefaults,
  normalizeFileTemplateLibraryDefaultTabId,
  normalizeFileTemplateLibraryInteraction,
  normalizeFileTemplateLibraryTabOrder,
  normalizeVisibleFileTemplateLibraryDefaultTabId,
  normalizeFileTemplateTabInteraction,
  normalizeFileTemplateTabs,
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

  it("normalizes tag-filter and template-group tabs", () => {
    expect(
      normalizeFileTemplateTabs([
        { id: " tag-medical ", name: " 病 ", type: "tag-filter", tags: ["#病", " 医学 ", "#病"] },
        { id: "group-common", name: " 常用模板 ", type: "template-group", templatePaths: [" 我的资源//模板/项目模板.md ", ""] },
        { name: "空标签页", type: "tag-filter", tags: [] }
      ])
    ).toEqual([
      { id: "tag-medical", name: "病", type: "tag-filter", tags: ["病", "医学"], templatePaths: [] },
      { id: "group-common", name: "常用模板", type: "template-group", tags: [], templatePaths: ["我的资源/模板/项目模板.md"] }
    ]);
  });

  it("keeps template tab data shared while normalizing per-surface interaction switches", () => {
    expect(DEFAULT_FILE_TEMPLATE_TAB_INTERACTION).toEqual({
      enableDesktopDrag: true,
      enableMobileDrag: false,
      enableMobileReorder: false,
      mobileReadOnly: true
    });
    expect(normalizeFileTemplateTabInteraction({ enableDesktopDrag: false, enableMobileDrag: true, enableMobileReorder: true, mobileReadOnly: false })).toEqual({
      enableDesktopDrag: false,
      enableMobileDrag: true,
      enableMobileReorder: true,
      mobileReadOnly: false
    });
    expect(normalizeFileTemplateTabInteraction({}, true)).toEqual({
      enableDesktopDrag: true,
      enableMobileDrag: false,
      enableMobileReorder: false,
      mobileReadOnly: true
    });
  });

  it("normalizes template library tab order, default tab, and per-surface tab drag settings", () => {
    const available = [
      FILE_TEMPLATE_LIBRARY_TAB_ALL,
      FILE_TEMPLATE_LIBRARY_TAB_FAVORITE,
      FILE_TEMPLATE_LIBRARY_TAB_RECENT,
      getFileTemplateLibraryCategoryTabId("未分类"),
      getFileTemplateLibraryCategoryTabId("病历"),
      "custom:group-common"
    ];

    expect(DEFAULT_FILE_TEMPLATE_LIBRARY_INTERACTION).toEqual({
      enableDesktopTabDrag: true,
      enableMobileTabDrag: false
    });
    expect(
      normalizeFileTemplateLibraryTabOrder(
        ["category:病历", "recent", "bad", "custom:group-common", "recent"],
        available
      )
    ).toEqual(["category:病历", "recent", "custom:group-common", "all", "favorite", "category:未分类"]);
    expect(normalizeFileTemplateLibraryDefaultTabId("category:病历", available)).toBe("category:病历");
    expect(normalizeFileTemplateLibraryDefaultTabId("missing", available)).toBe(FILE_TEMPLATE_LIBRARY_TAB_ALL);
    expect(normalizeFileTemplateLibraryInteraction({ enableDesktopTabDrag: false, enableMobileTabDrag: true })).toEqual({
      enableDesktopTabDrag: false,
      enableMobileTabDrag: true
    });
  });

  it("limits visible template-library tabs to all plus template groups", () => {
    const tabs = normalizeFileTemplateTabs([
      { id: "tag-medical", name: "病历", type: "tag-filter", tags: ["病历"] },
      { id: "group-common", name: "常用模板", type: "template-group", templatePaths: ["我的资源/模板/项目模板.md"] },
      { id: "group-case", name: "病历模板", type: "template-group", templatePaths: ["我的资源/模板/病历模板.md"] }
    ]);

    expect(
      getVisibleFileTemplateLibraryTabIds(tabs, [
        "favorite",
        "custom:tag-medical",
        "category:未分类",
        "custom:group-case",
        "recent",
        "custom:group-common"
      ])
    ).toEqual(["all", "custom:group-case", "custom:group-common"]);
    expect(normalizeVisibleFileTemplateLibraryDefaultTabId("custom:group-common", tabs)).toBe("custom:group-common");
    expect(normalizeVisibleFileTemplateLibraryDefaultTabId("custom:tag-medical", tabs)).toBe(FILE_TEMPLATE_LIBRARY_TAB_ALL);
    expect(normalizeVisibleFileTemplateLibraryDefaultTabId("favorite", tabs)).toBe(FILE_TEMPLATE_LIBRARY_TAB_ALL);
    expect(getFileTemplateLibraryTemplateGroupTabId("group-common")).toBe("custom:group-common");
    expect(getFileTemplateLibraryTemplateGroupTab("custom:group-case", tabs)?.name).toBe("病历模板");
    expect(getFileTemplateLibraryTemplateGroupTab("custom:tag-medical", tabs)).toBeNull();
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

  it("filters custom tabs by Obsidian tags or explicit template paths", () => {
    expect(
      filterFileTemplateLibraryItemsForTab(items, {
        id: "病",
        name: "病",
        type: "tag-filter",
        tags: ["病"],
        templatePaths: []
      }).map((item) => item.path)
    ).toEqual(["我的资源/模板/疾病/疾病模板.md"]);

    expect(
      filterFileTemplateLibraryItemsForTab(items, {
        id: "group-common",
        name: "常用模板",
        type: "template-group",
        tags: [],
        templatePaths: ["我的资源/模板/项目模板.md", "missing.md", "我的资源/模板/疾病/疾病模板.md"]
      }).map((item) => item.path)
    ).toEqual(["我的资源/模板/项目模板.md", "我的资源/模板/疾病/疾病模板.md"]);
  });

  it("adds template paths to template-group tabs without duplicates", () => {
    expect(
      addTemplatePathToFileTemplateTab(
        [
          { id: "病", name: "病", type: "tag-filter", tags: ["病"], templatePaths: [] },
          { id: "group-common", name: "常用模板", type: "template-group", tags: [], templatePaths: ["我的资源/模板/项目模板.md"] }
        ],
        "group-common",
        " 我的资源//模板/项目模板.md "
      )[1].templatePaths
    ).toEqual(["我的资源/模板/项目模板.md"]);

    expect(
      addTemplatePathToFileTemplateTab(
        [{ id: "group-common", name: "常用模板", type: "template-group", tags: [], templatePaths: [] }],
        "group-common",
        "我的资源/模板/疾病/疾病模板.md"
      )[0].templatePaths
    ).toEqual(["我的资源/模板/疾病/疾病模板.md"]);
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
