import { describe, expect, it } from "vitest";
import { toggleTaskAtLine, parseMemoDocument } from "../src/markdown";
import { toggleTaskCheckboxWithRecurrence } from "../src/taskLineActions";
import { parseTaskIndexItemsFromMarkdown } from "../src/taskIndex";
import { parseMemosPlusTaskMetadata } from "../src/tasksFormat";

describe("task completion timestamp", () => {
  const completedAt = new Date(2026, 7, 20, 17, 31, 42);

  it("stores a real local completion timestamp alongside Tasks' visible done date", () => {
    const line = toggleTaskCheckboxWithRecurrence("- [ ] 复诊 📅 2026-08-21", completedAt);

    expect(line).toContain("- [x] 复诊 📅 2026-08-21 ✅ 2026-08-20");
    expect(parseMemosPlusTaskMetadata(line)).toEqual({ target: "tasks", completedAt: "2026-08-20T17:31:42" });
    const [indexed] = parseTaskIndexItemsFromMarkdown(line, { filePath: "任务.md", fileName: "任务", mtime: 1 });
    expect(indexed).toMatchObject({ completed: true, doneDate: "2026-08-20", completedAt: "2026-08-20T17:31:42" });
  });

  it("clears the done date and precise timestamp when reopening a task", () => {
    const completed = toggleTaskCheckboxWithRecurrence("- [ ] 复诊", completedAt);
    const reopened = toggleTaskCheckboxWithRecurrence(completed, new Date(2026, 7, 21, 8, 0, 0));

    expect(reopened).toBe("- [ ] 复诊");
    expect(parseMemosPlusTaskMetadata(reopened)).toBeUndefined();
  });

  it("keeps the timestamp only on recurring history, never the next occurrence", () => {
    const result = toggleTaskCheckboxWithRecurrence("- [ ] 服药 🔁 every day 📅 2026-08-20", completedAt);
    const [history, next] = result.split("\n");

    expect(parseMemosPlusTaskMetadata(history)).toEqual({ target: "tasks", completedAt: "2026-08-20T17:31:42" });
    expect(next).toContain("- [ ] 服药 🔁 every day 📅 2026-08-21");
    expect(parseMemosPlusTaskMetadata(next)).toBeUndefined();
  });

  it("records the same metadata for Memos home-page task checkboxes", () => {
    const source = ["# 2026", "", "## 2026-08", "", "### 2026-08-20 周四", "", "- 2026-08-20 17:30", "  - [ ] 记录完成时间"].join("\n");
    const memo = parseMemoDocument(source).memos[0]!;
    const updated = toggleTaskAtLine(source, memo, 0, true, completedAt);

    expect(updated).toContain("- [x] 记录完成时间 ✅");
    expect(parseMemosPlusTaskMetadata(updated)).toMatchObject({ target: "tasks", completedAt: "2026-08-20T17:31:42" });
  });
});
