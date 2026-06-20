import { describe, expect, it } from "vitest";
import type { MemoItem } from "../src/markdown";
import {
  DEFAULT_MOBILE_LIGHT_HOME_RECENT_COUNT,
  DEFAULT_MOBILE_LIGHT_HOME_SECTIONS,
  DEFAULT_MOBILE_HOME_CUSTOM_MODULES,
  DEFAULT_MOBILE_HOME_LAYOUT,
  buildMobileLightHomeSections,
  normalizeMobileLightHomeRecentCount,
  normalizeMobileLightHomeSections,
  normalizeMobileHomeCustomModules,
  normalizeMobileHomeLayout
} from "../src/mobileLightHome";
import { createOrganizerMemoState } from "../src/organizerPanel";

function memo(partial: Partial<MemoItem>): MemoItem {
  return {
    id: partial.id ?? "memo",
    filePath: partial.filePath ?? "我的资源/Memos/2026.md",
    date: partial.date ?? "2026-06-19",
    time: partial.time ?? "09:00",
    datetime: partial.datetime ?? new Date(2026, 5, 19, 9, 0),
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

const memos = [
  memo({ id: "new", content: "新收集内容", datetime: new Date(2026, 5, 19, 9, 0) }),
  memo({ id: "organized", content: "已经整理", datetime: new Date(2026, 5, 18, 9, 0) }),
  memo({ id: "older", content: "稍早内容", datetime: new Date(2026, 5, 17, 9, 0), date: "2026-06-17" }),
  memo({ id: "archived", content: "归档内容", isArchived: true, datetime: new Date(2026, 5, 16, 9, 0), date: "2026-06-16" })
];

describe("mobile light home helpers", () => {
  it("normalizes section visibility and heights for a compact mobile home", () => {
    const sections = normalizeMobileLightHomeSections({
      inbox: { visible: false, height: 999 },
      recent: { height: 20 }
    });

    expect(DEFAULT_MOBILE_LIGHT_HOME_RECENT_COUNT).toBe(10);
    expect(DEFAULT_MOBILE_LIGHT_HOME_SECTIONS.inbox).toEqual({ visible: true, height: 160 });
    expect(sections.inbox).toEqual({ visible: false, height: 360 });
    expect(sections.recent).toEqual({ visible: true, height: 96 });
    expect(normalizeMobileLightHomeRecentCount("80")).toBe(30);
    expect(normalizeMobileLightHomeRecentCount("bad")).toBe(10);
  });

  it("builds inbox and recent sections from loaded memos without vault reads", () => {
    const sections = buildMobileLightHomeSections(memos, {
      today: "2026-06-19",
      states: { organized: createOrganizerMemoState("organized") },
      sectionSettings: DEFAULT_MOBILE_LIGHT_HOME_SECTIONS,
      recentCount: 2
    });

    expect(sections.map((section) => [section.id, section.total, section.items.map((item) => item.id)])).toEqual([
      ["inbox", 2, ["new", "older"]],
      ["recent", 3, ["new", "organized"]]
    ]);
  });

  it("omits disabled sections", () => {
    const sections = buildMobileLightHomeSections(memos, {
      today: "2026-06-19",
      states: {},
      sectionSettings: normalizeMobileLightHomeSections({ inbox: { visible: false } }),
      recentCount: 10
    });

    expect(sections.map((section) => section.id)).toEqual(["recent"]);
  });

  it("normalizes mobile home layout presets and custom module switches", () => {
    expect(DEFAULT_MOBILE_HOME_LAYOUT).toBe("sidebar-composer");
    expect(normalizeMobileHomeLayout("minimal")).toBe("minimal");
    expect(normalizeMobileHomeLayout("bad")).toBe("sidebar-composer");

    const custom = normalizeMobileHomeCustomModules({
      composer: false,
      sidebar: true,
      memoList: false,
      stats: false,
      unknown: true
    });

    expect(custom.composer).toBe(false);
    expect(custom.sidebar).toBe(true);
    expect(custom.memoList).toBe(false);
    expect(custom.stats).toBe(false);
    expect(custom.recent).toBe(DEFAULT_MOBILE_HOME_CUSTOM_MODULES.recent);
  });

  it("keeps legacy mobile home settings normalized for migration only", () => {
    const custom = normalizeMobileHomeCustomModules({ composer: false, sidebar: true, memoList: false, unknown: true });

    expect(normalizeMobileHomeLayout("sidebar-only")).toBe("sidebar-only");
    expect(normalizeMobileHomeLayout("unknown")).toBe(DEFAULT_MOBILE_HOME_LAYOUT);
    expect(custom.composer).toBe(false);
    expect(custom.sidebar).toBe(true);
    expect(custom.memoList).toBe(false);
    expect(custom.recent).toBe(DEFAULT_MOBILE_HOME_CUSTOM_MODULES.recent);
  });
});
