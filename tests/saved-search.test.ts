import { describe, expect, it } from "vitest";
import {
  filterMemosBySavedSearch,
  getSavedSearchTagOptions,
  normalizeSavedSearches,
  savedSearchIncludesArchivedCondition,
  type SavedSearch
} from "../src/savedSearch";
import type { MemoItem } from "../src/markdown";

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

const memos = [
  memo({ id: "a", content: "整理膝关节资料 #项目/memos", tags: ["项目/memos"], hasLink: true }),
  memo({ id: "b", date: "2026-06-12", content: "- [ ] 写检索式 ⏫ 📅 2026-06-17 🔁", hasOpenTask: true }),
  memo({ id: "c", date: "2025-06-13", filePath: "我的资源/Memos/2025.md", content: "往年今日", isPinned: true, tags: ["置顶"], hasImage: true }),
  memo({ id: "d", date: "2026-06-10", content: "归档资料", isArchived: true, tags: ["归档"] }),
  memo({ id: "e", date: "2026-06-14", content: "- [x] 完成检索式 ✅ 2026-06-15 ⏫", hasClosedTask: true }),
  memo({ id: "f", date: "2026-06-15", content: "- [ ] 逾期任务 📅 2026-06-16", hasOpenTask: true }),
  memo({ id: "g", date: "2026-06-16", content: "- [ ] 未来任务 🛫 2026-06-20 🔽", hasOpenTask: true })
];

function search(conditions: SavedSearch["conditions"]): SavedSearch {
  return {
    id: "search",
    name: "检索式",
    match: "all",
    searchScope: "memos",
    conditions
  };
}

describe("filterMemosBySavedSearch", () => {
  it("matches tag and text conditions together", () => {
    const result = filterMemosBySavedSearch(memos, search([
      { field: "tag", operator: "contains", value: "项目" },
      { field: "text", operator: "contains", value: "膝关节" }
    ]));

    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("matches date ranges and year conditions", () => {
    const result = filterMemosBySavedSearch(memos, search([
      { field: "date", operator: "between", value: "2025-01-01", valueTo: "2025-12-31" },
      { field: "year", operator: "equals", value: "2025" }
    ]));

    expect(result.map((item) => item.id)).toEqual(["c"]);
  });

  it("matches status, task, image, link, and path conditions", () => {
    expect(filterMemosBySavedSearch(memos, search([{ field: "status", operator: "equals", value: "pinned" }])).map((item) => item.id)).toEqual(["c"]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "task", operator: "exists" }])).map((item) => item.id)).toEqual(["b", "e", "f", "g"]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "image", operator: "exists" }])).map((item) => item.id)).toEqual(["c"]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "link", operator: "notExists" }])).map((item) => item.id)).toEqual(["b", "c", "d", "e", "f", "g"]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "path", operator: "contains", value: "2025.md" }])).map((item) => item.id)).toEqual(["c"]);
  });

  it("supports negative text and tag operators", () => {
    const result = filterMemosBySavedSearch(memos, search([
      { field: "text", operator: "notContains", value: "膝关节" },
      { field: "tag", operator: "notEquals", value: "归档" }
    ]));

    expect(result.map((item) => item.id)).toEqual(["b", "c", "e", "f", "g"]);
  });

  it("supports matching any condition", () => {
    const result = filterMemosBySavedSearch(memos, {
      id: "any",
      name: "或条件",
      match: "any",
      searchScope: "memos",
      conditions: [
        { field: "tag", operator: "equals", value: "项目/memos" },
        { field: "image", operator: "exists" }
      ]
    });

    expect(result.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("matches Obsidian Tasks task status, priority, dates, recurrence, and shortcuts", () => {
    expect(filterMemosBySavedSearch(memos, search([{ field: "taskStatus", operator: "equals", value: "open" }])).map((item) => item.id)).toEqual([
      "b",
      "f",
      "g"
    ]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "taskStatus", operator: "equals", value: "completed" }])).map((item) => item.id)).toEqual([
      "e"
    ]);
    expect(
      filterMemosBySavedSearch(
        memos,
        search([
          { field: "taskStatus", operator: "equals", value: "open" },
          { field: "taskPriority", operator: "equals", value: "high" }
        ])
      ).map((item) => item.id)
    ).toEqual(["b"]);
    expect(
      filterMemosBySavedSearch(memos, search([{ field: "taskDueDate", operator: "equals", value: "$today" }]), { today: "2026-06-17" }).map(
        (item) => item.id
      )
    ).toEqual(["b"]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "taskOverdue", operator: "exists" }]), { today: "2026-06-17" }).map((item) => item.id)).toEqual([
      "f"
    ]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "taskRecurring", operator: "exists" }])).map((item) => item.id)).toEqual(["b"]);
    expect(filterMemosBySavedSearch(memos, search([{ field: "taskFuture", operator: "exists" }]), { today: "2026-06-17" }).map((item) => item.id)).toEqual([
      "g"
    ]);
  });

  it("resolves relative date tokens for custom sidebar filters", () => {
    expect(
      filterMemosBySavedSearch(
        memos,
        search([{ field: "date", operator: "equals", value: "$today" }]),
        { today: "2026-06-13" }
      ).map((item) => item.id)
    ).toEqual(["a"]);
    expect(
      filterMemosBySavedSearch(
        memos,
        search([{ field: "date", operator: "between", value: "$weekStart", valueTo: "$weekEnd" }]),
        { today: "2026-06-13" }
      ).map((item) => item.id)
    ).toEqual(["a", "b", "d", "e"]);
  });
});

describe("normalizeSavedSearches", () => {
  it("keeps valid searches and drops invalid entries", () => {
    const result = normalizeSavedSearches([
      {
        id: "ok",
        name: "未完成任务",
        match: "any",
        searchScope: "vault",
        conditions: [{ field: "taskStatus", operator: "equals", value: "open" }]
      },
      {
        id: "legacy",
        name: "旧检索式",
        match: "all",
        conditions: [{ field: "tag", operator: "contains", value: "项目" }]
      },
      { id: "", name: "", match: "all", conditions: [] },
      { id: "bad", name: "Bad", match: "all", searchScope: "everything", conditions: [{ field: "unknown", operator: "exists" }] }
    ]);

    expect(result).toEqual([
      {
        id: "ok",
        name: "未完成任务",
        match: "any",
        searchScope: "vault",
        conditions: [{ field: "taskStatus", operator: "equals", value: "open" }]
      },
      {
        id: "legacy",
        name: "旧检索式",
        match: "all",
        searchScope: "memos",
        conditions: [{ field: "tag", operator: "contains", value: "项目" }]
      }
    ]);
  });
});

describe("getSavedSearchTagOptions", () => {
  it("combines memo tags and vault tags", () => {
    const result = getSavedSearchTagOptions(memos, {
      "#鸡汤": 8,
      "#项目/memos": 2,
      "#软件": 1
    });

    expect(result).toEqual(["归档", "鸡汤", "软件", "项目/memos", "置顶"]);
  });
});

describe("savedSearchIncludesArchivedCondition", () => {
  it("detects an explicit archived status condition", () => {
    expect(savedSearchIncludesArchivedCondition(search([{ field: "status", operator: "equals", value: "archived" }]))).toBe(true);
    expect(savedSearchIncludesArchivedCondition(search([{ field: "text", operator: "contains", value: "archived" }]))).toBe(false);
  });
});
