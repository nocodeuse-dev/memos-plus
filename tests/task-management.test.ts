import { describe, expect, it } from "vitest";
import { filterTaskManagementItems, taskManagementCounts } from "../src/taskManagement";
import { parseTaskIndexItemsFromMarkdown } from "../src/taskIndex";

const items = parseTaskIndexItemsFromMarkdown(
  [
    "- [ ] 逾期任务 🔺 📅 2026-07-31",
    "- [ ] 今天任务 ⏫ 📅 2026-08-01",
    "- [ ] 本周任务 🔽 📅 2026-08-03",
    "- [ ] 无日期任务",
    "- [x] 已完成任务 ✅ 2026-07-30"
  ].join("\n"),
  { filePath: "项目/任务.md", fileName: "任务", mtime: 100 }
);

describe("task management filters", () => {
  it("calculates the task manager tab counts from the shared task index", () => {
    expect(taskManagementCounts(items, "2026-08-01")).toEqual({
      open: 4,
      overdue: 1,
      today: 1,
      week: 2,
      completed: 1
    });
  });

  it("combines status, priority, and text search without rescanning files", () => {
    expect(
      filterTaskManagementItems(items, {
        filter: "open",
        priority: "high",
        query: "今天",
        today: "2026-08-01"
      }).map((item) => item.text)
    ).toEqual(["今天任务 ⏫ 📅 2026-08-01"]);
  });

  it("can show completed tasks separately", () => {
    expect(
      filterTaskManagementItems(items, {
        filter: "completed",
        priority: "all",
        query: "",
        today: "2026-08-01"
      }).map((item) => item.text)
    ).toEqual(["已完成任务 ✅ 2026-07-30"]);
  });
});
