import { describe, expect, it } from "vitest";
import { buildTasksMarkdownLine, normalizeTaskPriority, normalizeTaskRecurrence } from "../src/tasksFormat";

describe("Tasks markdown formatter", () => {
  it("builds an Obsidian Tasks line with priority, due date, and created date", () => {
    expect(
      buildTasksMarkdownLine(
        "给 Memos Plus 添加项目功能",
        {
          priority: "medium",
          dueDate: "2026-06-20",
          addCreatedDate: true
        },
        new Date(2026, 5, 14, 10, 30)
      )
    ).toBe("- [ ] 给 Memos Plus 添加项目功能 🔼 📅 2026-06-20 ➕ 2026-06-14");
  });

  it("builds a task with a project tag, dates, and a custom recurrence", () => {
    expect(
      buildTasksMarkdownLine("  - [ ] 添加发送到项目功能  ", {
        priority: "high",
        projectTag: "项目/MemosPlus",
        startDate: "2026-06-15",
        scheduledDate: "2026-06-18",
        dueDate: "2026-06-20",
        recurrence: "custom",
        customRecurrence: "every 2 weeks",
        addCreatedDate: false
      })
    ).toBe("- [ ] 添加发送到项目功能 #项目/MemosPlus ⏫ 🔁 every 2 weeks 🛫 2026-06-15 ⏳ 2026-06-18 📅 2026-06-20");
  });

  it("normalizes nested task markers before adding task metadata", () => {
    expect(
      buildTasksMarkdownLine("- * [ ] 测试多少安 🔺", {
        priority: "highest",
        startDate: "2026-06-20",
        addCreatedDate: true,
        createdDate: "2026-06-20"
      })
    ).toBe("- [ ] 测试多少安 🔺 🛫 2026-06-20 ➕ 2026-06-20");

    expect(buildTasksMarkdownLine("- - [ ] 输出的每个标题支持AI优化", { priority: "none" })).toBe("- [ ] 输出的每个标题支持AI优化");
  });

  it("normalizes invalid priority and recurrence values to safe defaults", () => {
    expect(normalizeTaskPriority("最高")).toBe("highest");
    expect(normalizeTaskPriority("unknown")).toBe("medium");
    expect(normalizeTaskRecurrence("每周")).toBe("weekly");
    expect(normalizeTaskRecurrence("unknown")).toBe("none");
  });
});
