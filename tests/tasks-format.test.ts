import { describe, expect, it } from "vitest";
import {
  attachMemosPlusTaskMetadata,
  buildTasksMarkdownLine,
  normalizeTaskPriority,
  normalizeTaskRecurrence,
  parseMemosPlusTaskMetadata,
  stripMemosPlusTaskMetadata
} from "../src/tasksFormat";

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

  it("keeps Tasks syntax while recording precise Reminder timing", () => {
    const line = buildTasksMarkdownLine("复诊", {
      syncTarget: "reminders",
      syncTag: "#Apple同步",
      dueDate: "2026-08-12",
      dueTime: "14:30",
      reminderDate: "2026-08-12",
      reminderTime: "14:15",
      reminderMinutesBefore: 15,
      priority: "high"
    });
    expect(line).toContain("- [ ] 复诊 ⏫ 📅 2026-08-12 ⏰ 14:30 #Apple同步");
    expect(parseMemosPlusTaskMetadata(line)).toEqual({
      target: "reminders",
      dueTime: "14:30",
      reminderDate: "2026-08-12",
      reminderTime: "14:15",
      reminderMinutesBefore: 15
    });
  });

  it("records Calendar start/end timing without turning it into a Reminder", () => {
    const line = buildTasksMarkdownLine("门诊会议", {
      syncTarget: "calendar",
      syncTag: "#Apple同步",
      startDate: "2026-08-13",
      startTime: "09:00",
      endTime: "10:30",
      reminderMinutesBefore: 30,
      allDay: false,
      priority: "none"
    });
    expect(line).toContain("🛫 2026-08-13 #Apple同步");
    expect(parseMemosPlusTaskMetadata(line)).toEqual({
      target: "calendar",
      startTime: "09:00",
      endTime: "10:30",
      reminderMinutesBefore: 30
    });
  });

  it("leaves legacy Tasks lines unchanged when no sync target is selected", () => {
    expect(buildTasksMarkdownLine("历史任务", { dueDate: "2026-08-14", priority: "none" })).toBe("- [ ] 历史任务 📅 2026-08-14");
  });

  it("collapses every canonical and legacy task metadata marker without removing other comments", () => {
    const oldMetadata = encodeURIComponent(JSON.stringify({ target: "reminders", dueTime: "09:15" }));
    const latestMetadata = encodeURIComponent(JSON.stringify({ target: "reminders", dueTime: "17:30", reminderMinutesBefore: 30 }));
    const legacy = `<!-- memos-plus-task- meta:${oldMetadata} -->`;
    const canonical = `<!-- memos-plus-task-meta:${latestMetadata} -->`;
    const line = `- [ ] 复诊 ${legacy} ${legacy} <!-- 普通注释 --> <!-- memos-plus-task-detail:abc --> <!-- memos-plus-apple-id:local-1 --> ${canonical}`;

    expect(parseMemosPlusTaskMetadata(line)).toEqual({ target: "reminders", dueTime: "17:30", reminderMinutesBefore: 30 });
    const stripped = stripMemosPlusTaskMetadata(line);
    expect(stripped).not.toContain("memos-plus-task-meta:");
    expect(stripped).not.toContain("memos-plus-task- meta:");
    expect(stripped).toContain("<!-- 普通注释 -->");
    expect(stripped).toContain("memos-plus-task-detail:abc");
    expect(stripped).toContain("memos-plus-apple-id:local-1");

    const attached = attachMemosPlusTaskMetadata(line, parseMemosPlusTaskMetadata(line)!);
    expect(attached.match(/memos-plus-task-meta:/gu)).toHaveLength(1);
    expect(attached).not.toContain("memos-plus-task- meta:");
    expect(parseMemosPlusTaskMetadata(`- [ ] 旧任务 ${legacy}`)).toEqual({ target: "reminders", dueTime: "09:15" });
  });
});
