import { describe, expect, it, vi } from "vitest";
import type { SavedSearch } from "../src/savedSearch";
import {
  createSavedSearchFromTemplate,
  createSidebarGroup,
  createSidebarSearchItem,
  normalizeSidebarItems,
  type SidebarItem
} from "../src/sidebar";

vi.mock("obsidian", () => ({
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

function savedSearch(partial: Partial<SavedSearch>): SavedSearch {
  return {
    id: partial.id ?? "search",
    name: partial.name ?? "检索式",
    match: partial.match ?? "all",
    searchScope: partial.searchScope ?? "memos",
    conditions: partial.conditions ?? [{ field: "task", operator: "exists" }]
  };
}

describe("normalizeSidebarItems", () => {
  it("defaults to an empty custom directory", () => {
    expect(normalizeSidebarItems(undefined, [])).toEqual([]);
  });

  it("places legacy saved searches into one default group when no sidebar tree exists", () => {
    const result = normalizeSidebarItems(undefined, [
      savedSearch({ id: "tasks", name: "未完成任务" }),
      savedSearch({ id: "links", name: "链接", conditions: [{ field: "link", operator: "exists" }] })
    ]);

    expect(result).toEqual([
      {
        id: "default-searches",
        type: "group",
        title: "检索式",
        icon: "folder",
        collapsed: false,
        children: [
          { id: "item-tasks", type: "search", title: "未完成任务", icon: "filter", searchId: "tasks" },
          { id: "item-links", type: "search", title: "链接", icon: "filter", searchId: "links" }
        ]
      }
    ]);
  });

  it("keeps valid nested groups and drops searches that point to missing rules", () => {
    const raw: SidebarItem[] = [
      createSidebarGroup("group-a", "常用", "folder", [
        createSidebarSearchItem("item-good", "待办", "list-checks", "tasks"),
        createSidebarSearchItem("item-missing", "坏链接", "filter", "missing")
      ])
    ];

    expect(normalizeSidebarItems(raw, [savedSearch({ id: "tasks", name: "待办" })])).toEqual([
      {
        id: "group-a",
        type: "group",
        title: "常用",
        icon: "folder",
        collapsed: false,
        children: [{ id: "item-good", type: "search", title: "待办", icon: "list-checks", searchId: "tasks" }]
      }
    ]);
  });
});

describe("createSavedSearchFromTemplate", () => {
  it("creates fixed filter templates as editable saved searches", () => {
    expect(createSavedSearchFromTemplate("pinned", { id: "pinned", name: "置顶" })).toMatchObject({
      id: "pinned",
      name: "置顶",
      conditions: [{ field: "status", operator: "equals", value: "pinned" }]
    });
    expect(createSavedSearchFromTemplate("todo", { id: "todo", name: "待办" })).toMatchObject({
      conditions: [{ field: "taskStatus", operator: "equals", value: "open" }]
    });
    expect(createSavedSearchFromTemplate("links", { id: "links", name: "有链接" })).toMatchObject({
      conditions: [{ field: "link", operator: "exists" }]
    });
  });

  it("creates relative date and value templates", () => {
    expect(createSavedSearchFromTemplate("today", { id: "today", name: "今天" })).toMatchObject({
      conditions: [{ field: "date", operator: "equals", value: "$today" }]
    });
    expect(createSavedSearchFromTemplate("week", { id: "week", name: "本周" })).toMatchObject({
      conditions: [{ field: "date", operator: "between", value: "$weekStart", valueTo: "$weekEnd" }]
    });
    expect(createSavedSearchFromTemplate("year", { id: "year-2026", name: "2026", value: "2026" })).toMatchObject({
      conditions: [{ field: "year", operator: "equals", value: "2026" }]
    });
    expect(createSavedSearchFromTemplate("tag", { id: "tag", name: "鸡汤", value: "#鸡汤" })).toMatchObject({
      conditions: [{ field: "tag", operator: "equals", value: "鸡汤" }]
    });
  });
});
