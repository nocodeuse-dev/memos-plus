import { describe, expect, it } from "vitest";
import { parseNaturalLanguageTask } from "../src/taskNaturalLanguage";

describe("natural language quick task parser", () => {
  const now = new Date(2026, 7, 11, 9, 0);

  it("parses the documented Chinese quick-task example without losing the title", () => {
    expect(parseNaturalLanguageTask("明天下午3点复诊张先生，提前30分钟提醒 #门诊 !高", now)).toMatchObject({
      title: "复诊张先生",
      date: "2026-08-12",
      time: "15:00",
      dueTime: "15:00",
      startTime: "15:00",
      reminderMinutesBefore: 30,
      reminderDate: "2026-08-12",
      reminderTime: "14:30",
      tags: ["#门诊"],
      priority: "high",
      matched: true
    });
  });

  it("supports today, the day after tomorrow and weekday dates", () => {
    expect(parseNaturalLanguageTask("今天上午9点复查", now).date).toBe("2026-08-11");
    expect(parseNaturalLanguageTask("后天晚上8点随访", now).date).toBe("2026-08-13");
    expect(parseNaturalLanguageTask("周五下午2点开会", now).date).toBe("2026-08-14");
  });

  it("supports half hours, hour reminders, tags and all requested priorities", () => {
    const parsed = parseNaturalLanguageTask("周一晚上7点半训练，提前2小时提醒 #康复 #家庭 !低", now);
    expect(parsed.time).toBe("19:30");
    expect(parsed.reminderMinutesBefore).toBe(120);
    expect(parsed.tags).toEqual(["#康复", "#家庭"]);
    expect(parsed.priority).toBe("low");
  });

  it("keeps the original text intact when no rule can be recognized", () => {
    expect(parseNaturalLanguageTask("整理没有日期的普通任务", now)).toMatchObject({
      title: "整理没有日期的普通任务",
      date: "",
      time: "",
      reminderMinutesBefore: undefined,
      tags: [],
      priority: "none",
      matched: false
    });
  });
});
