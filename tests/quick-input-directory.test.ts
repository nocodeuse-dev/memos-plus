import { describe, expect, it, vi } from "vitest";
import type { MemoItem } from "../src/markdown";
import type { SavedSearch } from "../src/savedSearch";
import { buildQuickInputDirectoryEntries, buildQuickInputDirectoryPreview, collectQuickInputDirectoryVaultSearches } from "../src/quickInputDirectory";
import { createSidebarGroup, createSidebarSearchItem } from "../src/sidebar";
import { DEFAULT_SETTINGS, type MemosPlusSettings } from "../src/settings";

vi.mock("obsidian", () => ({
  App: class {},
  Modal: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

function memo(partial: Partial<MemoItem>): MemoItem {
  return {
    id: partial.id ?? "memo",
    filePath: partial.filePath ?? "我的资源/Memos/2026.md",
    date: partial.date ?? "2026-06-13",
    time: partial.time ?? "09:00",
    datetime: partial.datetime ?? new Date(2026, 5, 13, 9, 0),
    year: partial.year ?? partial.date?.slice(0, 4) ?? "2026",
    month: partial.month ?? partial.date?.slice(0, 7) ?? "2026-06",
    weekday: partial.weekday ?? "周六",
    content: partial.content ?? "",
    tags: partial.tags ?? [],
    isPinned: partial.isPinned ?? false,
    isStarred: partial.isStarred ?? false,
    isArchived: partial.isArchived ?? false,
    hasOpenTask: partial.hasOpenTask ?? false,
    hasClosedTask: partial.hasClosedTask ?? false,
    hasImage: partial.hasImage ?? false,
    hasLink: partial.hasLink ?? false,
    range: partial.range ?? { start: 0, end: 1 }
  };
}

function search(partial: Partial<SavedSearch>): SavedSearch {
  return {
    id: partial.id ?? "search",
    name: partial.name ?? "检索式",
    match: partial.match ?? "all",
    searchScope: partial.searchScope ?? "memos",
    conditions: partial.conditions ?? [{ field: "text", operator: "contains", value: "项目" }]
  };
}

const memos = [
  memo({
    id: "project",
    content: "Memos Plus 插件优化 #项目",
    tags: ["项目"],
    datetime: new Date(2026, 5, 13, 10, 0),
    time: "10:00"
  }),
  memo({
    id: "task",
    content: "- [ ] 整理今日任务",
    hasOpenTask: true,
    datetime: new Date(2026, 5, 13, 9, 0)
  }),
  memo({
    id: "archived",
    content: "归档内容",
    tags: ["归档"],
    isArchived: true,
    datetime: new Date(2026, 5, 12, 9, 0),
    date: "2026-06-12"
  })
];

function settings(): MemosPlusSettings {
  const savedSearches = [
    search({ id: "projects", name: "所有项目", conditions: [{ field: "tag", operator: "contains", value: "项目" }] }),
    search({ id: "software", name: "软件项目", conditions: [{ field: "text", operator: "contains", value: "插件" }] }),
    search({ id: "tasks", name: "任务", conditions: [{ field: "task", operator: "exists" }] }),
    search({ id: "vault", name: "全库", searchScope: "vault", conditions: [{ field: "text", operator: "contains", value: "肩袖" }] })
  ];
  return {
    ...DEFAULT_SETTINGS,
    savedSearches,
    sidebarItems: [
      createSidebarGroup("projects", "项目", "folder", [
        createSidebarSearchItem("all-projects", "所有项目", "filter", "projects"),
        createSidebarSearchItem("software-projects", "软件项目", "filter", "software")
      ]),
      createSidebarSearchItem("tasks", "任务", "list-checks", "tasks"),
      createSidebarSearchItem("vault", "全库", "search", "vault")
    ]
  };
}

describe("quick input directory data", () => {
  it("builds a compact directory from all memos and custom sidebar items", () => {
    const entries = buildQuickInputDirectoryEntries(settings(), memos, { today: "2026-06-13", limit: 6 });

    expect(entries.map((entry) => entry.title)).toEqual(["全部笔记", "项目", "所有项目", "软件项目", "任务", "全库"]);
    expect(entries[0]).toMatchObject({ type: "all", count: 2 });
    expect(entries.find((entry) => entry.title === "项目")).toMatchObject({
      type: "group",
      count: 2,
      children: [
        expect.objectContaining({ type: "search", title: "所有项目", count: 1 }),
        expect.objectContaining({ type: "search", title: "软件项目", count: 1 })
      ]
    });
    expect(entries.find((entry) => entry.title === "所有项目")).toMatchObject({ type: "search", count: 1 });
    expect(entries.find((entry) => entry.title === "软件项目")).toMatchObject({ type: "search", count: 1 });
    expect(entries.find((entry) => entry.title === "任务")).toMatchObject({ type: "search", count: 1 });
    expect(entries.find((entry) => entry.title === "全库")).toMatchObject({ type: "search", count: "..." });
  });

  it("can omit counts so hidden fileCount modules do not calculate directory totals", () => {
    const entries = buildQuickInputDirectoryEntries(settings(), memos, { today: "2026-06-13", limit: 6, includeCounts: false });

    expect(entries.map((entry) => entry.count)).toEqual(["", "", "", "", "", ""]);
    expect(entries.find((entry) => entry.title === "项目")).toMatchObject({
      type: "group",
      count: "",
      children: [
        expect.objectContaining({ title: "所有项目", count: "" }),
        expect.objectContaining({ title: "软件项目", count: "" })
      ]
    });
  });

  it("adds built-in sidebar layout modules instead of only custom sidebar items", () => {
    const currentSettings = settings();
    const entries = buildQuickInputDirectoryEntries(currentSettings, memos, {
      today: "2026-06-13",
      limit: 20,
      visibleModules: new Set(["allNotes", "projectDirectory", "organizeDirectory", "taskDirectory", "tagFilters", "fileCount", "fileList"]),
      moduleOrder: ["allNotes", "projectDirectory", "organizeDirectory", "taskDirectory", "tagFilters", "fileCount", "fileList"]
    });

    const titles = entries.map((entry) => entry.title);
    expect(titles).toEqual(
      expect.arrayContaining(["全部笔记", "项目", "所有项目", "软件项目", "待整理", "今日新增", "未归档", "有链接", "有图片", "未完成任务", "#项目", "#归档"])
    );
    expect(titles.indexOf("待整理")).toBeGreaterThan(titles.indexOf("软件项目"));
    expect(titles.indexOf("#项目")).toBeGreaterThan(titles.indexOf("未完成任务"));
    expect(entries.find((entry) => entry.title === "待整理")).toMatchObject({ type: "organizer", count: 2 });
    expect(entries.find((entry) => entry.title === "未完成任务")).toMatchObject({ type: "organizer", count: 1 });
    expect(entries.find((entry) => entry.title === "#项目")).toMatchObject({ type: "tag", count: 1 });
  });

  it("shows filtered content below the clicked directory item and respects limits", () => {
    const currentSettings = settings();
    const entries = buildQuickInputDirectoryEntries(currentSettings, memos, { today: "2026-06-13", limit: 6 });
    const allPreview = buildQuickInputDirectoryPreview(entries[0], currentSettings, memos, { today: "2026-06-13", limit: 1 });
    const groupPreview = buildQuickInputDirectoryPreview(entries.find((entry) => entry.title === "项目")!, currentSettings, memos, {
      today: "2026-06-13",
      limit: 20
    });
    const allProjectsEntry = entries.find((entry) => entry.title === "所有项目");
    if (!allProjectsEntry) {
      throw new Error("Expected 所有项目 navigation entry");
    }
    const projectPreview = buildQuickInputDirectoryPreview(allProjectsEntry, currentSettings, memos, {
      today: "2026-06-13",
      limit: 20
    });
    const vaultPreview = buildQuickInputDirectoryPreview(entries.find((entry) => entry.title === "全库")!, currentSettings, memos, {
      today: "2026-06-13",
      limit: 20
    });

    expect(allPreview.total).toBe(2);
    expect(allPreview.items).toHaveLength(1);
    expect(allPreview.items[0]).toMatchObject({ type: "memo", title: "Memos Plus 插件优化 #项目" });
    expect(groupPreview.items.map((item) => item.title)).toEqual(["Memos Plus 插件优化 #项目"]);
    expect(projectPreview.items.map((item) => item.title)).toEqual(["Memos Plus 插件优化 #项目"]);
    expect(vaultPreview).toEqual({ items: [], total: 0 });
  });

  it("collects vault searches for lazy preview loading instead of showing child folders", () => {
    const currentSettings = settings();
    const entries = buildQuickInputDirectoryEntries(currentSettings, memos, { today: "2026-06-13", limit: 6 });
    const vaultEntry = entries.find((entry) => entry.title === "全库");

    expect(vaultEntry).toMatchObject({ type: "search", count: "..." });
    expect(vaultEntry ? collectQuickInputDirectoryVaultSearches(vaultEntry).map((searchItem) => searchItem.name) : []).toEqual(["全库"]);
  });
});
