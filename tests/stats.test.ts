import { describe, expect, it } from "vitest";
import { computeMemoStats, countByYear } from "../src/stats";
import type { MemoItem } from "../src/markdown";

function memo(partial: Partial<MemoItem>): MemoItem {
  return {
    id: partial.id ?? "memos.md:0",
    filePath: "memos.md",
    date: partial.date ?? "2026-06-12",
    time: partial.time ?? "06:03",
    datetime: partial.datetime ?? new Date(2026, 5, 12, 6, 3),
    year: partial.year ?? partial.date?.slice(0, 4) ?? "2026",
    month: partial.month ?? partial.date?.slice(0, 7) ?? "2026-06",
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

describe("computeMemoStats", () => {
  it("counts memos, unique tags, active days, today, and open tasks", () => {
    const stats = computeMemoStats(
      [
        memo({ date: "2026-06-12", tags: ["项目"], hasOpenTask: true }),
        memo({ date: "2026-06-12", tags: ["项目", "memos"] }),
        memo({ date: "2026-06-11", tags: ["回顾"], isArchived: true })
      ],
      "2026-06-12"
    );

    expect(stats).toEqual({
      total: 3,
      tags: 3,
      activeDays: 2,
      today: 2,
      openTasks: 1,
      untagged: 0,
      withImages: 0,
      withLinks: 0
    });
  });
});

describe("countByYear", () => {
  it("returns descending year counts", () => {
    expect(countByYear([memo({ date: "2025-01-01" }), memo({ date: "2026-06-12" }), memo({ date: "2026-06-11" })])).toEqual([
      { year: "2026", count: 2 },
      { year: "2025", count: 1 }
    ]);
  });
});
