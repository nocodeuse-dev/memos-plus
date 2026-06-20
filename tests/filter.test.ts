import { describe, expect, it } from "vitest";
import { filterMemos, getAllTags } from "../src/filter";
import type { MemoItem } from "../src/markdown";

function memo(partial: Partial<MemoItem>): MemoItem {
  return {
    id: partial.id ?? "memos.md:0",
    filePath: "memos.md",
    date: partial.date ?? "2026-06-12",
    time: partial.time ?? "06:03",
    datetime: partial.datetime ?? new Date(2026, 5, 12, 6, 3),
    year: partial.year ?? "2026",
    month: partial.month ?? "2026-06",
    weekday: partial.weekday ?? "周五",
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

describe("filterMemos", () => {
  const memos = [
    memo({ id: "a", date: "2026-06-12", content: "today #work", tags: ["work"], hasLink: true }),
    memo({ id: "b", date: "2026-06-10", content: "task", hasOpenTask: true }),
    memo({ id: "c", date: "2026-06-01", content: "old", isPinned: true, tags: ["置顶"], hasImage: true }),
    memo({ id: "d", date: "2025-06-12", content: "last year", isStarred: true, tags: ["收藏"] }),
    memo({ id: "e", date: "2026-06-12", content: "archived", isArchived: true, tags: ["归档"] })
  ];

  it("hides archived memos by default", () => {
    expect(filterMemos(memos, { view: "all", today: "2026-06-12" }).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "d"
    ]);
  });

  it("filters status views", () => {
    expect(filterMemos(memos, { view: "todo", today: "2026-06-12" }).map((item) => item.id)).toEqual(["b"]);
    expect(filterMemos(memos, { view: "pinned", today: "2026-06-12" }).map((item) => item.id)).toEqual(["c"]);
    expect(filterMemos(memos, { view: "starred", today: "2026-06-12" }).map((item) => item.id)).toEqual(["d"]);
    expect(filterMemos(memos, { view: "archived", today: "2026-06-12" }).map((item) => item.id)).toEqual(["e"]);
  });

  it("filters by today, this week, tag, and search", () => {
    expect(filterMemos(memos, { view: "today", today: "2026-06-12" }).map((item) => item.id)).toEqual(["a"]);
    expect(filterMemos(memos, { view: "week", today: "2026-06-12" }).map((item) => item.id)).toEqual(["a", "b"]);
    expect(filterMemos(memos, { view: "all", today: "2026-06-12", tag: "work" }).map((item) => item.id)).toEqual(["a"]);
    expect(filterMemos(memos, { view: "all", today: "2026-06-12", query: "last" }).map((item) => item.id)).toEqual(["d"]);
  });

  it("filters Memoria-style saved searches and years", () => {
    expect(filterMemos(memos, { view: "untagged", today: "2026-06-12" }).map((item) => item.id)).toEqual(["b"]);
    expect(filterMemos(memos, { view: "images", today: "2026-06-12" }).map((item) => item.id)).toEqual(["c"]);
    expect(filterMemos(memos, { view: "links", today: "2026-06-12" }).map((item) => item.id)).toEqual(["a"]);
    expect(filterMemos(memos, { view: "all", today: "2026-06-12", year: "2025" }).map((item) => item.id)).toEqual(["d"]);
  });
});

describe("getAllTags", () => {
  it("returns sorted unique tags", () => {
    expect(getAllTags([memo({ tags: ["b", "a"] }), memo({ tags: ["a", "c"] })])).toEqual(["a", "b", "c"]);
  });
});
