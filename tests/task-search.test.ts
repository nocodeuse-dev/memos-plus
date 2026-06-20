import { describe, expect, it } from "vitest";
import { findMatchingTasks, parseTaskLines } from "../src/taskSearch";
import type { SavedSearchCondition } from "../src/savedSearch";

describe("task search parsing", () => {
  it("extracts Obsidian Tasks status, priority, dates, and recurrence from task lines", () => {
    const tasks = parseTaskLines(
      [
        "- [ ] 写任务检索 ⏫ 📅 2026-06-17 ⏳ 2026-06-18 🛫 2026-06-16 ➕ 2026-06-15 🔁",
        "- [x] 完成旧任务 🔽 ✅ 2026-06-16"
      ].join("\n")
    );

    expect(tasks).toEqual([
      expect.objectContaining({
        text: "写任务检索 ⏫ 📅 2026-06-17 ⏳ 2026-06-18 🛫 2026-06-16 ➕ 2026-06-15 🔁",
        completed: false,
        priority: "high",
        dueDate: "2026-06-17",
        scheduledDate: "2026-06-18",
        startDate: "2026-06-16",
        createdDate: "2026-06-15",
        doneDate: "",
        recurring: true
      }),
      expect.objectContaining({
        text: "完成旧任务 🔽 ✅ 2026-06-16",
        completed: true,
        priority: "low",
        dueDate: "",
        doneDate: "2026-06-16",
        recurring: false
      })
    ]);
  });

  it("matches multiple task conditions against the same task line", () => {
    const tasks = parseTaskLines(
      [
        "- [ ] 写任务检索 ⏫ 📅 2026-06-17 🔁",
        "- [ ] 普通任务 ⏫ 📅 2026-06-18",
        "- [x] 完成任务 ⏫ 📅 2026-06-17"
      ].join("\n")
    );
    const conditions: SavedSearchCondition[] = [
      { field: "taskStatus", operator: "equals", value: "open" },
      { field: "taskPriority", operator: "equals", value: "high" },
      { field: "taskDueDate", operator: "equals", value: "$today" },
      { field: "taskRecurring", operator: "exists" }
    ];

    expect(findMatchingTasks(tasks, conditions, { today: "2026-06-17" }).map((task) => task.text)).toEqual([
      "写任务检索 ⏫ 📅 2026-06-17 🔁"
    ]);
  });

  it("matches overdue and future task shortcuts", () => {
    const tasks = parseTaskLines(
      [
        "- [ ] 逾期任务 📅 2026-06-16",
        "- [x] 已完成的过期任务 📅 2026-06-15",
        "- [ ] 未来任务 🛫 2026-06-20"
      ].join("\n")
    );

    expect(findMatchingTasks(tasks, [{ field: "taskOverdue", operator: "exists" }], { today: "2026-06-17" }).map((task) => task.text)).toEqual([
      "逾期任务 📅 2026-06-16"
    ]);
    expect(findMatchingTasks(tasks, [{ field: "taskFuture", operator: "exists" }], { today: "2026-06-17" }).map((task) => task.text)).toEqual([
      "未来任务 🛫 2026-06-20"
    ]);
  });
});
