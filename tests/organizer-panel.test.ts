import { describe, expect, it } from "vitest";
import type { MemoItem } from "../src/markdown";
import {
  DEFAULT_ORGANIZER_PANEL_SECTIONS,
  DEFAULT_TASK_MANAGEMENT_VISIBLE_ITEMS,
  buildOrganizerTaskBranchSections,
  buildOrganizerPanelSections,
  createOrganizerMemoState,
  filterMemosForOrganizerFilter,
  normalizeOrganizerMemoStates,
  normalizeOrganizerPanelSections,
  normalizeTaskManagementVisibleItems
} from "../src/organizerPanel";

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
  memo({ id: "new", content: "今天的项目想法 #项目", hasLink: false }),
  memo({ id: "link", content: "链接资料 https://example.com", hasLink: true, datetime: new Date(2026, 5, 18, 10, 0), date: "2026-06-18" }),
  memo({ id: "image", content: "图片 ![[a.png]]", hasImage: true, datetime: new Date(2026, 5, 17, 10, 0), date: "2026-06-17" }),
  memo({ id: "task", content: "- [ ] 整理资料", hasOpenTask: true, datetime: new Date(2026, 5, 16, 10, 0), date: "2026-06-16" }),
  memo({ id: "archived", content: "归档内容", isArchived: true, datetime: new Date(2026, 5, 15, 10, 0), date: "2026-06-15" })
];

describe("organizer panel helpers", () => {
  it("normalizes all default sections and clamps custom heights", () => {
    const sections = normalizeOrganizerPanelSections({
      inbox: { visible: false, desktopHeight: 9999, mobileHeight: 20 },
      links: { visible: true, desktopHeight: 180 }
    });

    expect(Object.keys(sections)).toEqual(Object.keys(DEFAULT_ORGANIZER_PANEL_SECTIONS));
    expect(sections.inbox).toEqual({ visible: false, desktopHeight: 480, mobileHeight: 80 });
    expect(sections.links).toEqual({ visible: true, desktopHeight: 180, mobileHeight: 160 });
    expect(sections.tasks.visible).toBe(true);
  });

  it("normalizes task management visible items with all items enabled by default", () => {
    expect(DEFAULT_TASK_MANAGEMENT_VISIBLE_ITEMS).toEqual({
      incomplete: true,
      priorityHighest: true,
      priorityHigh: true,
      priorityMedium: true,
      priorityLow: true,
      priorityLowest: true,
      priorityNone: true,
      overdue: true,
      dueToday: true,
      dueThisWeek: true
    });

    expect(
      normalizeTaskManagementVisibleItems({
        incomplete: false,
        priorityHighest: false,
        overdue: false,
        unknown: false
      })
    ).toEqual({
      ...DEFAULT_TASK_MANAGEMENT_VISIBLE_ITEMS,
      incomplete: false,
      priorityHighest: false,
      overdue: false
    });
  });

  it("keeps organizer state in plugin data without requiring markdown tags", () => {
    const states = normalizeOrganizerMemoStates({
      new: { organized: true, organizedAt: "2026-06-19T08:00:00.000Z", lastAction: "organized", targetPath: "" },
      bad: "not-state"
    });

    expect(states).toEqual({
      new: { organized: true, organizedAt: "2026-06-19T08:00:00.000Z", lastAction: "organized", targetPath: "" }
    });
    expect(createOrganizerMemoState("organized", "我的资源/Memos/memos plus.md").organized).toBe(true);
  });

  it("builds bounded visible sections from loaded memos only", () => {
    const sections = buildOrganizerPanelSections(memos, {
      today: "2026-06-19",
      states: { link: createOrganizerMemoState("organized") },
      sectionSettings: DEFAULT_ORGANIZER_PANEL_SECTIONS,
      limit: 2
    });

    expect(sections.map((section) => [section.id, section.total])).toEqual([
      ["inbox", 3],
      ["today", 1],
      ["unarchived", 4],
      ["links", 1],
      ["images", 1],
      ["tasks", 1]
    ]);
    expect(sections.find((section) => section.id === "inbox")?.items.map((item) => item.id)).toEqual(["new", "image"]);
    expect(sections.find((section) => section.id === "links")?.items.map((item) => item.id)).toEqual(["link"]);
    expect(sections.every((section) => section.items.length <= 2)).toBe(true);
  });

  it("builds task priority and due-date branches from loaded task text", () => {
    const taskMemos = [
      memo({ id: "highest", content: "- [ ] 紧急任务 🔺 📅 2026-06-18", hasOpenTask: true, date: "2026-06-18", datetime: new Date(2026, 5, 18, 9, 0) }),
      memo({ id: "high", content: "- [ ] 高优先级任务 ⏫ 📅 2026-06-19", hasOpenTask: true }),
      memo({ id: "medium", content: "- [ ] 中优先级任务 🔼 📅 2026-06-21", hasOpenTask: true }),
      memo({ id: "low", content: "- [ ] 低优先级任务 🔽", hasOpenTask: true }),
      memo({ id: "lowest", content: "- [ ] 最低优先级任务 ⏬", hasOpenTask: true }),
      memo({ id: "none", content: "- [ ] 无优先级任务 📅 2026-06-20", hasOpenTask: true }),
      memo({ id: "done", content: "- [x] 已完成任务 ⏫ 📅 2026-06-18", hasClosedTask: true })
    ];

    const branches = buildOrganizerTaskBranchSections(taskMemos, {
      today: "2026-06-19",
      showPriorityBranches: true,
      showDateBranches: true
    });

    expect(branches.map((section) => [section.id, section.total])).toEqual([
      ["task-priority-highest", 1],
      ["task-priority-high", 1],
      ["task-priority-medium", 1],
      ["task-priority-low", 1],
      ["task-priority-lowest", 1],
      ["task-priority-none", 1],
      ["task-overdue", 1],
      ["task-due-today", 1],
      ["task-due-this-week", 4]
    ]);
    expect(filterMemosForOrganizerFilter("task-priority-high", taskMemos, { today: "2026-06-19", states: {} }).map((item) => item.id)).toEqual(["high"]);
    expect(filterMemosForOrganizerFilter("task-overdue", taskMemos, { today: "2026-06-19", states: {} }).map((item) => item.id)).toEqual(["highest"]);
    expect(filterMemosForOrganizerFilter("task-due-today", taskMemos, { today: "2026-06-19", states: {} }).map((item) => item.id)).toEqual(["high"]);
    expect(filterMemosForOrganizerFilter("task-due-this-week", taskMemos, { today: "2026-06-19", states: {} }).map((item) => item.id)).toEqual([
      "high",
      "medium",
      "none",
      "highest"
    ]);
  });

  it("hides individual task management items without changing task counts", () => {
    const taskMemos = [
      memo({ id: "highest", content: "- [ ] 紧急任务 🔺 📅 2026-06-18", hasOpenTask: true, date: "2026-06-18", datetime: new Date(2026, 5, 18, 9, 0) }),
      memo({ id: "high", content: "- [ ] 高优先级任务 ⏫ 📅 2026-06-19", hasOpenTask: true })
    ];
    const visibleItems = normalizeTaskManagementVisibleItems({
      incomplete: false,
      priorityHighest: false,
      overdue: false
    });

    const sections = buildOrganizerPanelSections(taskMemos, {
      today: "2026-06-19",
      states: {},
      sectionSettings: DEFAULT_ORGANIZER_PANEL_SECTIONS,
      taskManagementVisibleItems: visibleItems,
      limit: 0
    });
    const branches = buildOrganizerTaskBranchSections(taskMemos, {
      today: "2026-06-19",
      showPriorityBranches: true,
      showDateBranches: true,
      visibleItems
    });

    expect(sections.map((section) => section.id)).not.toContain("tasks");
    expect(branches.map((branch) => branch.id)).not.toContain("task-priority-highest");
    expect(branches.map((branch) => branch.id)).not.toContain("task-overdue");
    expect(branches.map((branch) => branch.id)).toContain("task-priority-high");
    expect(filterMemosForOrganizerFilter("task-overdue", taskMemos, { today: "2026-06-19", states: {} }).map((item) => item.id)).toEqual(["highest"]);
  });
});
