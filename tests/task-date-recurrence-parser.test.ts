import { describe, expect, it } from "vitest";
import { parseNaturalLanguageTask } from "../src/taskNaturalLanguage";

describe("shared Chinese date, time, and recurrence parser", () => {
  const now = new Date(2026, 7, 20, 10, 30);

  it("understands relative, weekday, and explicit month-day dates", () => {
    expect(parseNaturalLanguageTask("今天整理资料", now).date).toBe("2026-08-20");
    expect(parseNaturalLanguageTask("明天复诊", now).date).toBe("2026-08-21");
    expect(parseNaturalLanguageTask("后天随访", now).date).toBe("2026-08-22");
    expect(parseNaturalLanguageTask("本周五开会", now).date).toBe("2026-08-21");
    expect(parseNaturalLanguageTask("下周一查房", now).date).toBe("2026-08-24");
    expect(parseNaturalLanguageTask("8月21日完成报告", now).date).toBe("2026-08-21");
    expect(parseNaturalLanguageTask("9月23日复查", now).date).toBe("2026-09-23");
    expect(parseNaturalLanguageTask("2028年5月20日提醒我", now).date).toBe("2028-05-20");
    expect(parseNaturalLanguageTask("今年年底提交总结", now).date).toBe("2026-12-31");
  });

  it("does not invent a day for year, month, and week-only expressions", () => {
    for (const text of ["2028年规划", "明年3月复诊", "下周处理报告"]) {
      const parsed = parseNaturalLanguageTask(text, now);
      expect(parsed.date).toBe("");
      expect(parsed.requiresDateConfirmation).toBe(true);
      expect(parsed.dateExpression).not.toBe("");
      expect(parsed.title).toContain(parsed.dateExpression);
    }
  });

  it("calculates all requested relative intervals from the current date", () => {
    expect(parseNaturalLanguageTask("一周后复习", now).date).toBe("2026-08-27");
    expect(parseNaturalLanguageTask("两周后复习", now).date).toBe("2026-09-03");
    expect(parseNaturalLanguageTask("3天后换药", now).date).toBe("2026-08-23");
    expect(parseNaturalLanguageTask("半个月后复查", now).date).toBe("2026-09-04");
    expect(parseNaturalLanguageTask("一个月后缴费", now).date).toBe("2026-09-20");
    expect(parseNaturalLanguageTask("两个月后复诊", now).date).toBe("2026-10-20");
    expect(parseNaturalLanguageTask("半年后年检", now).date).toBe("2027-02-20");
    expect(parseNaturalLanguageTask("5小时后提醒我喝水", now)).toMatchObject({ date: "2026-08-20", time: "15:30", title: "喝水" });
  });

  it("parses Chinese times, time ranges, and derived reminder timestamps", () => {
    expect(parseNaturalLanguageTask("下周三下午3点复诊", now)).toMatchObject({ date: "2026-08-26", time: "15:00", startTime: "15:00", dueTime: "15:00" });
    expect(parseNaturalLanguageTask("后天下午2点半训练", now).time).toBe("14:30");
    expect(parseNaturalLanguageTask("8月21日下午5点到6点完成报告，提前30分钟提醒", now)).toMatchObject({
      title: "完成报告",
      date: "2026-08-21",
      startTime: "17:00",
      endTime: "18:00",
      dueTime: "17:00",
      reminderMinutesBefore: 30,
      reminderDate: "2026-08-21",
      reminderTime: "16:30"
    });
  });

  it("maps supported recurring Chinese rules to standard or custom Tasks rules", () => {
    expect(parseNaturalLanguageTask("每天服药", now)).toMatchObject({ recurrence: "daily", date: "2026-08-20" });
    expect(parseNaturalLanguageTask("每周开会", now)).toMatchObject({ recurrence: "weekly", date: "2026-08-20" });
    expect(parseNaturalLanguageTask("每两周复习一次", now)).toMatchObject({ recurrence: "custom", customRecurrence: "every 2 weeks" });
    expect(parseNaturalLanguageTask("每隔两周复习", now)).toMatchObject({ recurrence: "custom", customRecurrence: "every 2 weeks" });
    expect(parseNaturalLanguageTask("每月整理", now)).toMatchObject({ recurrence: "monthly" });
    expect(parseNaturalLanguageTask("每个月15号缴费", now)).toMatchObject({ recurrence: "custom", customRecurrence: "every month on the 15th", date: "2026-09-15" });
    expect(parseNaturalLanguageTask("每年体检", now)).toMatchObject({ recurrence: "yearly" });
    expect(parseNaturalLanguageTask("每年5月20日复查", now)).toMatchObject({ recurrence: "custom", customRecurrence: "every year on May 20", date: "2027-05-20" });
    expect(parseNaturalLanguageTask("每周一上午9点开会", now)).toMatchObject({ recurrence: "custom", customRecurrence: "every week on Monday", date: "2026-08-24", time: "09:00", title: "开会" });
    expect(parseNaturalLanguageTask("每3个月复诊", now)).toMatchObject({ recurrence: "custom", customRecurrence: "every 3 months" });
  });
});
