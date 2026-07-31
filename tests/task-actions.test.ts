import { describe, expect, it } from "vitest";
import { replaceIndexedTaskLine, toggleTaskCheckbox } from "../src/taskLineActions";

describe("task management line actions", () => {
  it("toggles unordered and ordered Markdown task checkboxes without rewriting task metadata", () => {
    expect(toggleTaskCheckbox("- [ ] 普通任务 📅 2026-08-01")).toBe("- [x] 普通任务 📅 2026-08-01");
    expect(toggleTaskCheckbox("  1. [x] 有序任务 ✅ 2026-08-01")).toBe("  1. [ ] 有序任务 ✅ 2026-08-01");
  });

  it("replaces only the exact indexed source line and supports recurring-task output", () => {
    const source = ["# Tasks", "- [ ] 每天复盘 🔁 every day 📅 2026-08-01", "结尾"].join("\n");
    const replacement = ["- [x] 每天复盘 🔁 every day 📅 2026-08-01 ✅ 2026-08-01", "- [ ] 每天复盘 🔁 every day 📅 2026-08-02"].join("\n");
    const result = replaceIndexedTaskLine(source, { lineNumber: 2, line: "- [ ] 每天复盘 🔁 every day 📅 2026-08-01" }, replacement);

    expect(result.updated).toBe(true);
    expect(result.source).toBe(["# Tasks", replacement, "结尾"].join("\n"));
  });

  it("refuses to overwrite a stale line number", () => {
    const source = ["# Tasks", "新增内容", "- [ ] 原任务"].join("\n");
    const result = replaceIndexedTaskLine(source, { lineNumber: 2, line: "- [ ] 原任务" }, "- [x] 原任务");

    expect(result).toEqual({ source, updated: false });
  });
});
