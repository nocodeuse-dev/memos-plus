import { describe, expect, it } from "vitest";
import { taskRecurrenceRule, toggleTaskCheckboxWithRecurrence } from "../src/taskLineActions";
import { parseMemosPlusTaskMetadata } from "../src/tasksFormat";

describe("recurring task completion fallback", () => {
  const now = new Date(2026, 7, 11, 12, 0);

  it("preserves the completed history and generates the next daily task", () => {
    const result = toggleTaskCheckboxWithRecurrence("- [ ] 服药 🔁 every day 📅 2026-08-11", now);
    expect(result).toContain("- [x] 服药 🔁 every day 📅 2026-08-11 ✅ 2026-08-11");
    expect(result).toContain("- [ ] 服药 🔁 every day 📅 2026-08-12");
    expect(parseMemosPlusTaskMetadata(result.split("\n")[0]!)).toMatchObject({ completedAt: "2026-08-11T12:00:00" });
  });

  it("skips weekends for weekday recurrence and shifts related dates together", () => {
    const result = toggleTaskCheckboxWithRecurrence("- [ ] 复诊 🔁 every weekday 🛫 2026-08-14 ⏳ 2026-08-14 📅 2026-08-14", now);
    expect(result).toContain("- [x] 复诊 🔁 every weekday 🛫 2026-08-14 ⏳ 2026-08-14 📅 2026-08-14 ✅ 2026-08-11");
    expect(result).toContain("- [ ] 复诊 🔁 every weekday 🛫 2026-08-17 ⏳ 2026-08-17 📅 2026-08-17");
  });

  it("supports custom numeric cycles and removes the Apple id from the new occurrence", () => {
    const line = "- [ ] 随访 🔁 every 2 weeks 📅 2026-08-11 #Apple同步 <!-- memos-plus-apple-id:old-1 -->";
    const result = toggleTaskCheckboxWithRecurrence(line, now);
    expect(result).toContain("📅 2026-08-25 #Apple同步");
    expect(result.match(/memos-plus-apple-id:old-1/gu)).toHaveLength(1);
  });

  it("does not generate another task when a stale completed task is toggled open", () => {
    const result = toggleTaskCheckboxWithRecurrence("- [x] 服药 🔁 every day 📅 2026-08-11 ✅ 2026-08-11", now);
    expect(result).toBe("- [ ] 服药 🔁 every day 📅 2026-08-11");
  });

  it("extracts custom recurrence without consuming following task metadata", () => {
    expect(taskRecurrenceRule("- [ ] 检查 🔁 every 3 months 📅 2026-08-11 #门诊")).toBe("every 3 months");
  });

  it("advances Chinese-parser custom weekday, month-day, and year-day rules", () => {
    expect(toggleTaskCheckboxWithRecurrence("- [ ] 周会 🔁 every week on Monday 📅 2026-08-10", now)).toContain("📅 2026-08-17");
    expect(toggleTaskCheckboxWithRecurrence("- [ ] 月报 🔁 every month on the 15th 📅 2026-08-15", now)).toContain("📅 2026-09-15");
    expect(toggleTaskCheckboxWithRecurrence("- [ ] 年检 🔁 every year on May 20 📅 2026-05-20", now)).toContain("📅 2027-05-20");
  });
});
