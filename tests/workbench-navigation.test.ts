import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ setIcon: () => undefined }));

import { createLearningCard } from "../src/learning/learningCards";
import { taskCalendarTasks } from "../src/taskCalendar";
import {
  workbenchNavigationCounts,
  workbenchSecondaryRouteIds,
  workbenchTaskRouteOptions
} from "../src/workbenchNavigation";
import type { TaskIndexItem } from "../src/taskIndex";

function task(overrides: Partial<TaskIndexItem> = {}): TaskIndexItem {
  return {
    filePath: "我的资源/Memos/任务收件箱.md",
    fileName: "任务收件箱",
    line: "- [ ] 示例任务",
    lineNumber: 1,
    text: "示例任务",
    title: "示例任务",
    capturedAt: "",
    capturedAtTime: 0,
    completed: false,
    priority: "none",
    dueDate: "",
    scheduledDate: "",
    startDate: "",
    createdDate: "",
    doneDate: "",
    completedAt: "",
    startTime: "",
    endDate: "",
    endTime: "",
    dueTime: "",
    reminderDate: "",
    reminderTime: "",
    allDay: false,
    syncTarget: "",
    appleSyncId: "",
    appleSyncTagged: false,
    recurring: false,
    mtime: 0,
    ...overrides
  };
}

describe("unified workbench navigation", () => {
  it("uses the established TaskIndex data to calculate all task and learning badges", () => {
    const today = "2026-08-21";
    const newCard = createLearningCard({ filePath: "学习.md", content: "新卡 #学习" }, new Date("2026-08-21T09:00:00"));
    const mastered = { ...newCard, id: "mastered", state: "review" as const, stability: 30, difficulty: 4, reps: 8, lapses: 1, dueAt: "2026-10-01T09:00:00.000Z" };
    const tasks = [
      task({ title: "今日新增", createdDate: today }),
      task({ title: "逾期", dueDate: "2026-08-20" }),
      task({ title: "已完成", completed: true, createdDate: today })
    ];

    expect(workbenchNavigationCounts(tasks, [newCard, mastered], today)).toMatchObject({
      pending: 2,
      todayNew: 2,
      overdue: 1,
      completed: 1,
      learning: { today: 1, learning: 1, mastered: 1, all: 2 }
    });
  });

  it("keeps today's new tasks independent from due dates and preserves completed rows", () => {
    const tasks = [
      task({ title: "今天新建未完成", createdDate: "2026-08-21" }),
      task({ title: "今天新建已完成", createdDate: "2026-08-21", completed: true }),
      task({ title: "明天才到期", dueDate: "2026-08-22" })
    ];

    const options = workbenchTaskRouteOptions("today-new", "2026-08-21");
    expect(options).toMatchObject({ navigation: "all", createdOnDate: "2026-08-21", viewMode: "day" });
    expect(taskCalendarTasks(tasks, options.navigation!, "2026-08-21", options).map((item) => item.title)).toEqual([
      "今天新建未完成",
      "今天新建已完成"
    ]);
  });

  it("shows only the active primary section's second-level routes", () => {
    expect(workbenchSecondaryRouteIds("directory")).toEqual([]);
    expect(workbenchSecondaryRouteIds("tasks")).toEqual(["pending", "today-new", "overdue", "completed"]);
    expect(workbenchSecondaryRouteIds("learning")).toEqual(["today", "due", "learning", "strengthen", "mastered"]);
    expect(workbenchSecondaryRouteIds("projects")).toEqual([]);
  });
});
