import { afterEach, describe, expect, it, vi } from "vitest";

const { MockTFile } = vi.hoisted(() => ({
  MockTFile: class MockTFile {
    extension = "md";
    stat = { mtime: 1 };
    constructor(public path: string) {}
  }
}));

vi.mock("obsidian", () => ({
  App: class {},
  TFile: MockTFile
}));

import { toggleIndexedTask } from "../src/taskActions";
import type { TaskIndexItem } from "../src/taskIndex";

afterEach(() => vi.useRealTimers());

function task(line: string): TaskIndexItem {
  return {
    filePath: "任务.md",
    fileName: "任务",
    line,
    lineNumber: 1,
    text: "Tasks API 任务",
    title: "Tasks API 任务",
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
    mtime: 1
  };
}

describe("Tasks API completion bridge", () => {
  it("adds an exact Memos Plus completion timestamp after the Tasks API toggles a line", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20, 17, 31, 42));
    const file = new MockTFile("任务.md");
    let source = "- [ ] Tasks API 任务";
    const app = {
      vault: {
        getAbstractFileByPath: () => file,
        process: async (_file: unknown, change: (value: string) => string) => { source = change(source); }
      },
      plugins: {
        plugins: {
          "obsidian-tasks-plugin": {
            apiV1: {
              executeToggleTaskDoneCommand: () => "- [x] Tasks API 任务 ✅ 2026-08-20"
            }
          }
        }
      }
    };

    await expect(toggleIndexedTask(app as never, task(source))).resolves.toMatchObject({ updated: true });
    expect(source).toContain("✅ 2026-08-20");
    expect(source).toContain("2026-08-20T17%3A31%3A42");
  });
});
