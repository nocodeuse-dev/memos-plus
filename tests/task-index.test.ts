import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TaskIndex,
  filterTaskIndexItems,
  getTaskIndexOrganizerCounts,
  parseTaskIndexItemsFromMarkdown
} from "../src/taskIndex";

describe("TaskIndex helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const source = [
    "# 项目",
    "- [ ] 最高优先级 🔺 📅 2026-06-18",
    "- [ ] 高优先级 ⏫ 📅 2026-06-20 ⏳ 2026-06-19 🛫 2026-06-18 ➕ 2026-06-17 🔁",
    "- [ ] 中优先级 🔼 📅 2026-06-21",
    "- [ ] 低优先级 🔽",
    "- [ ] 最低优先级 ⏬",
    "- [ ] 无优先级 📅 2026-06-19",
    "- [x] 已完成 ⏫ 📅 2026-06-18 ✅ 2026-06-18",
    "普通文本"
  ].join("\n");

  it("parses only task lines with file metadata, line number, priority, dates, and recurrence", () => {
    const items = parseTaskIndexItemsFromMarkdown(source, {
      filePath: "我的资源/Memos/memos plus.md",
      fileName: "memos plus",
      mtime: 123
    });

    expect(items).toHaveLength(7);
    expect(items[0]).toEqual(
      expect.objectContaining({
        filePath: "我的资源/Memos/memos plus.md",
        fileName: "memos plus",
        lineNumber: 2,
        line: "- [ ] 最高优先级 🔺 📅 2026-06-18",
        text: "最高优先级 🔺 📅 2026-06-18",
        completed: false,
        priority: "highest",
        dueDate: "2026-06-18",
        mtime: 123
      })
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        priority: "high",
        dueDate: "2026-06-20",
        scheduledDate: "2026-06-19",
        startDate: "2026-06-18",
        createdDate: "2026-06-17",
        recurring: true
      })
    );
    expect(items[6]).toEqual(expect.objectContaining({ completed: true, doneDate: "2026-06-18" }));
  });

  it("counts unfinished organizer task branches from cached items", () => {
    const items = parseTaskIndexItemsFromMarkdown(source, {
      filePath: "我的资源/Memos/memos plus.md",
      fileName: "memos plus",
      mtime: 123
    });

    expect(getTaskIndexOrganizerCounts(items, "2026-06-19")).toEqual(
      expect.objectContaining({
        tasks: 6,
        "task-priority-highest": 1,
        "task-priority-high": 1,
        "task-priority-medium": 1,
        "task-priority-low": 1,
        "task-priority-lowest": 1,
        "task-priority-none": 1,
        "task-overdue": 1,
        "task-due-today": 1,
        "task-due-this-week": 4
      })
    );
  });

  it("filters cached whole-vault task items for organizer task branches", () => {
    const items = parseTaskIndexItemsFromMarkdown(source, {
      filePath: "我的资源/Memos/memos plus.md",
      fileName: "memos plus",
      mtime: 123
    });

    expect(filterTaskIndexItems(items, "tasks", "2026-06-19").map((item) => item.text)).toEqual([
      "高优先级 ⏫ 📅 2026-06-20 ⏳ 2026-06-19 🛫 2026-06-18 ➕ 2026-06-17 🔁",
      "最高优先级 🔺 📅 2026-06-18",
      "中优先级 🔼 📅 2026-06-21",
      "低优先级 🔽",
      "最低优先级 ⏬",
      "无优先级 📅 2026-06-19"
    ]);
    expect(filterTaskIndexItems(items, "task-priority-high", "2026-06-19").map((item) => item.text)).toEqual([
      "高优先级 ⏫ 📅 2026-06-20 ⏳ 2026-06-19 🛫 2026-06-18 ➕ 2026-06-17 🔁"
    ]);
    expect(filterTaskIndexItems(items, "task-overdue", "2026-06-19").map((item) => item.text)).toEqual(["最高优先级 🔺 📅 2026-06-18"]);
    expect(filterTaskIndexItems(items, "task-due-today", "2026-06-19").map((item) => item.text)).toEqual(["无优先级 📅 2026-06-19"]);
    expect(filterTaskIndexItems(items, "task-due-this-week", "2026-06-19").map((item) => item.text)).toEqual([
      "高优先级 ⏫ 📅 2026-06-20 ⏳ 2026-06-19 🛫 2026-06-18 ➕ 2026-06-17 🔁",
      "最高优先级 🔺 📅 2026-06-18",
      "中优先级 🔼 📅 2026-06-21",
      "无优先级 📅 2026-06-19"
    ]);
  });

  it("sorts task results by the collected task timestamp before file modified time", () => {
    const recentlyEditedOldTask = parseTaskIndexItemsFromMarkdown("- [ ] 2026-06-09 05:16 制作一个最像 xmind 的思维导图插件 🔺", {
      filePath: "我的资源/Memos/2026.md",
      fileName: "2026",
      mtime: new Date(2026, 6, 2, 6, 9).getTime()
    });
    const olderFileNewerTask = parseTaskIndexItemsFromMarkdown("- [ ] 2026-06-27 13:09 [自媒体矩阵运营Agent](https://b23.tv/lTma3Y3) 🔺", {
      filePath: "我的资源/Memos/2026.md",
      fileName: "2026",
      mtime: new Date(2026, 5, 27, 13, 10).getTime()
    });

    const results = filterTaskIndexItems([...recentlyEditedOldTask, ...olderFileNewerTask], "task-priority-highest", "2026-07-02");

    expect(results.map((item) => item.text)).toEqual([
      "2026-06-27 13:09 [自媒体矩阵运营Agent](https://b23.tv/lTma3Y3) 🔺",
      "2026-06-09 05:16 制作一个最像 xmind 的思维导图插件 🔺"
    ]);
    expect(results.map((item) => item.capturedAt)).toEqual(["2026-06-27 13:09", "2026-06-09 05:16"]);
  });

  it("tracks cache state and can clear cached task results without rebuilding", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const file = {
      path: "我的资源/Memos/memos plus.md",
      name: "memos plus.md",
      basename: "memos plus",
      extension: "md",
      stat: { mtime: 123 }
    };
    const index = new TaskIndex(
      {
        vault: {
          getMarkdownFiles: () => [file],
          cachedRead: async () => "- [ ] 全库任务 ⏫"
        }
      } as never,
      { isMobile: () => false }
    );

    await index.rebuild({ batchSize: 1 });
    expect(index.getStatus()).toEqual(
      expect.objectContaining({
        indexedTasks: 1,
        indexedFiles: 1,
        cacheState: "normal"
      })
    );

    index.invalidate(file.path);
    expect(index.getStatus()).toEqual(expect.objectContaining({ indexedTasks: 0, cacheState: "needs-update" }));

    await index.rebuild({ batchSize: 1 });
    index.clearCache();
    expect(index.getStatus()).toEqual(
      expect.objectContaining({
        indexedTasks: 0,
        indexedFiles: 0,
        updatedAt: "",
        cacheState: "needs-update"
      })
    );
  });

  it("rebuilds again when a file changes during an active rebuild", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const file = {
      path: "我的资源/Memos/memos plus.md",
      name: "memos plus.md",
      basename: "memos plus",
      extension: "md",
      stat: { mtime: 1 }
    };
    let source = "- [ ] 旧任务";
    let reads = 0;
    let releaseFirstRead!: () => void;
    let markFirstReadStarted!: () => void;
    const firstReadBlocked = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const firstReadStarted = new Promise<void>((resolve) => {
      markFirstReadStarted = resolve;
    });
    const index = new TaskIndex({
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: async () => {
          reads += 1;
          const captured = source;
          if (reads === 1) {
            markFirstReadStarted();
            await firstReadBlocked;
          }
          return captured;
        }
      }
    } as never);

    const firstRebuild = index.rebuild({ batchSize: 1 });
    await firstReadStarted;
    source = "- [ ] 新任务";
    file.stat.mtime = 2;
    index.invalidate(file.path);
    releaseFirstRead();
    await firstRebuild;

    expect(index.getStatus().cacheState).toBe("needs-update");
    await waitForTaskIndex(index, "normal");
    expect(index.getItems().map((item) => item.text)).toEqual(["新任务"]);
    expect(reads).toBe(2);
  });

  it("honors a manual clear-and-rebuild request made during an active rebuild", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const file = {
      path: "项目/任务.md",
      name: "任务.md",
      basename: "任务",
      extension: "md",
      stat: { mtime: 1 }
    };
    let reads = 0;
    let releaseFirstRead!: () => void;
    let markFirstReadStarted!: () => void;
    const firstReadBlocked = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const firstReadStarted = new Promise<void>((resolve) => {
      markFirstReadStarted = resolve;
    });
    const index = new TaskIndex({
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: async () => {
          reads += 1;
          if (reads === 1) {
            markFirstReadStarted();
            await firstReadBlocked;
          }
          return "- [ ] 手动重建任务";
        }
      }
    } as never);

    const firstRebuild = index.rebuild({ batchSize: 1 });
    await firstReadStarted;
    index.clearCache();
    const requestedRebuild = index.rebuild({ force: true, batchSize: 1 });
    releaseFirstRead();
    await Promise.all([firstRebuild, requestedRebuild]);

    await waitForTaskIndex(index, "normal");
    expect(index.getItems().map((item) => item.text)).toEqual(["手动重建任务"]);
    expect(reads).toBe(2);
  });
});

async function waitForTaskIndex(index: TaskIndex, expected: "normal" | "needs-update", timeoutMs = 200): Promise<void> {
  const startedAt = Date.now();
  while (index.getStatus().cacheState !== expected) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for task index state ${expected}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
