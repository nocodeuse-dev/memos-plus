import { describe, expect, it } from "vitest";
import {
  buildMemoBlock,
  insertMemo,
  parseMemoDocument,
  removeMemo,
  replaceMemoContent,
  toggleTaskAtLine
} from "../src/markdown";

describe("parseMemoDocument", () => {
  it("parses time-only memo markers with indented multi-line content", () => {
    const source = [
      "# 2026",
      "## 2026-06",
      "### 2026-06-12 周五",
      "- 2026-06-12 06:03",
      "  这是一条 memo #灵感",
      "  第二行内容继续写在这里",
      "  - [ ] 支持待办",
      ""
    ].join("\n");

    const doc = parseMemoDocument(source);

    expect(doc.memos).toHaveLength(1);
    expect(doc.memos[0]).toMatchObject({
      id: "memos.md:3",
      date: "2026-06-12",
      time: "06:03",
      year: "2026",
      month: "2026-06",
      weekday: "周五",
      content: "这是一条 memo #灵感\n第二行内容继续写在这里\n- [ ] 支持待办",
      tags: ["灵感"],
      isPinned: false,
      isStarred: false,
      isArchived: false,
      hasOpenTask: true,
      hasClosedTask: false
    });
    expect(doc.memos[0].range).toEqual({ start: 3, end: 6 });
  });

  it("extracts visible state tags and regular tags", () => {
    const source = [
      "# 2026",
      "## 2026-06",
      "### 2026-06-12 周五",
      "- 2026-06-12 06:03",
      "  #置顶 #收藏 #归档 #项目/插件",
      ""
    ].join("\n");

    const doc = parseMemoDocument(source);

    expect(doc.memos[0]).toMatchObject({
      tags: ["置顶", "收藏", "归档", "项目/插件"],
      isPinned: true,
      isStarred: true,
      isArchived: true
    });
  });
});

describe("insertMemo", () => {
  it("creates year, month, date, and time-only memo block in an empty file", () => {
    const result = insertMemo("", {
      date: "2026-06-12",
      time: "06:03",
      content: "这是一条 memo #灵感\n第二行内容继续写在这里"
    });

    expect(result).toBe([
      "# 2026",
      "",
      "## 2026-06",
      "",
      "### 2026-06-12 周五",
      "",
      "- 2026-06-12 06:03",
      "  这是一条 memo #灵感",
      "  第二行内容继续写在这里",
      ""
    ].join("\n"));
  });

  it("inserts into an existing date section without damaging other memos", () => {
    const source = [
      "# 2026",
      "",
      "## 2026-06",
      "",
      "### 2026-06-12 周五",
      "",
      "- 2026-06-12 08:00",
      "  later",
      ""
    ].join("\n");

    const result = insertMemo(source, {
      date: "2026-06-12",
      time: "06:03",
      content: "earlier"
    });

    expect(result).toContain("- 2026-06-12 06:03\n  earlier\n\n- 2026-06-12 08:00\n  later");
  });
});

describe("memo mutations", () => {
  const source = [
    "# 2026",
    "",
    "## 2026-06",
    "",
    "### 2026-06-12 周五",
    "",
    "- 2026-06-12 06:03",
    "  first line",
    "  - [ ] task",
    "",
    "- 2026-06-12 08:00",
    "  later",
    ""
  ].join("\n");

  it("builds a normalized memo block", () => {
    expect(buildMemoBlock("2026-06-12", "06:03", "line one\n\nline two")).toEqual([
      "- 2026-06-12 06:03",
      "  line one",
      "",
      "  line two"
    ]);
  });

  it("replaces only the selected memo content", () => {
    const doc = parseMemoDocument(source);
    const result = replaceMemoContent(source, doc.memos[0], "updated\n- [x] task");

    expect(result).toContain("- 2026-06-12 06:03\n  updated\n  - [x] task");
    expect(result).toContain("- 2026-06-12 08:00\n  later");
  });

  it("removes only the selected memo", () => {
    const doc = parseMemoDocument(source);
    const result = removeMemo(source, doc.memos[0]);

    expect(result).not.toContain("first line");
    expect(result).toContain("- 2026-06-12 08:00\n  later");
  });

  it("toggles a task line inside a memo", () => {
    const doc = parseMemoDocument(source);
    const result = toggleTaskAtLine(source, doc.memos[0], 1, true);

    expect(result).toContain("  - [x] task");
    expect(result).toContain("- 2026-06-12 08:00\n  later");
  });
});
