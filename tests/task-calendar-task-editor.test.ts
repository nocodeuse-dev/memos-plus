import { describe, expect, it } from "vitest";
import {
  parseTaskCalendarDetailMetadata,
  taskCalendarPostponeDate,
  taskCalendarTaskProjectTag,
  taskCalendarTaskTags,
  updateTaskCalendarTaskLine
} from "../src/taskCalendarTaskEditor";
import { parseTaskIndexItemsFromMarkdown } from "../src/taskIndex";

const context = { projectTagPrefix: "项目", appleSyncTag: "#Apple同步" };

function task(line: string) {
  return parseTaskIndexItemsFromMarkdown(line, { filePath: "任务.md", fileName: "任务", mtime: 1 })[0];
}

describe("task calendar inline editor", () => {
  it("reschedules a Reminder while preserving its Apple identity and detail metadata", () => {
    const source = '- [ ] 测试任务 ⏫ 📅 2026-08-10 ⏰ 17:31 #项目/工作 #检查 #Apple同步 <!-- memos-plus-apple-id:local-1 --> <!-- memos-plus-task-meta:%7B%22target%22%3A%22reminders%22%2C%22dueTime%22%3A%2217%3A31%22%7D -->';
    const updated = updateTaskCalendarTaskLine(task(source), {
      date: "2026-08-11",
      time: "09:15",
      reminderDate: "2026-08-11",
      reminderTime: "09:00",
      notes: "带影像资料"
    }, context);

    expect(updated).toContain("📅 2026-08-11");
    expect(updated).toContain("⏰ 09:15");
    expect(updated).toContain("memos-plus-apple-id:local-1");
    expect(updated).toContain("%22dueTime%22%3A%2209%3A15%22");
    expect(parseTaskCalendarDetailMetadata(updated).notes).toBe("带影像资料");
  });

  it("updates title, priority, project and tags without removing the Apple sync tag", () => {
    const source = "- [ ] 旧标题 🔼 📅 2026-08-10 #项目/旧项目 #旧标签 #Apple同步";
    const updated = updateTaskCalendarTaskLine(task(source), {
      title: "新标题",
      priority: "highest",
      projectTag: "#项目/新项目",
      tags: ["检查", "治疗"]
    }, context);

    expect(updated).toContain("新标题");
    expect(updated).toContain("🔺");
    expect(updated).toContain("#项目/新项目");
    expect(updated).toContain("#检查");
    expect(updated).toContain("#治疗");
    expect(updated).toContain("#Apple同步");
    expect(updated).not.toContain("旧标题");
    expect(updated).not.toContain("#旧标签");
    expect(taskCalendarTaskProjectTag(updated, "项目")).toBe("#项目/新项目");
    expect(taskCalendarTaskTags(updated, context)).toEqual(["#检查", "#治疗"]);
  });

  it("updates Tasks-compatible weekday and custom recurrence rules", () => {
    const source = "- [ ] 复诊 🔁 every week 📅 2026-08-10";
    const weekday = updateTaskCalendarTaskLine(task(source), { recurrence: "weekdays" }, context);
    expect(weekday).toContain("🔁 every weekday");
    const custom = updateTaskCalendarTaskLine(task(weekday), { recurrence: "custom", customRecurrence: "every 2 weeks" }, context);
    expect(custom).toContain("🔁 every 2 weeks");
    expect(updateTaskCalendarTaskLine(task(custom), { recurrence: "none" }, context)).not.toContain("🔁");
  });

  it("uses Monday of next week for the quick postpone action", () => {
    expect(taskCalendarPostponeDate("today", new Date(2026, 7, 10))).toBe("2026-08-10");
    expect(taskCalendarPostponeDate("tomorrow", new Date(2026, 7, 10))).toBe("2026-08-11");
    expect(taskCalendarPostponeDate("next-week", new Date(2026, 7, 10))).toBe("2026-08-17");
  });

  it("allows the inline form to clear an existing lead reminder", () => {
    const source = '- [ ] 测试任务 📅 2026-08-10 #Apple同步 <!-- memos-plus-task-meta:%7B%22target%22%3A%22reminders%22%2C%22reminderMinutesBefore%22%3A30%7D -->';
    const updated = updateTaskCalendarTaskLine(task(source), { reminderMinutesBefore: null }, context);
    expect(updated).not.toContain("reminderMinutesBefore");
  });
});
