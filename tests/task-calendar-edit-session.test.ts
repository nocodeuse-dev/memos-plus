import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskCalendarEditSession } from "../src/taskCalendarEditSession";
import { parseTaskIndexItemsFromMarkdown, type TaskIndexItem } from "../src/taskIndex";

const context = { projectTagPrefix: "项目", appleSyncTag: "#Apple同步" };

function task(line = '- [ ] 测试任务 📅 2026-08-10 ⏰ 17:31 #Apple同步 <!-- memos-plus-task-meta:%7B%22target%22%3A%22reminders%22%2C%22dueTime%22%3A%2217%3A31%22%7D -->'): TaskIndexItem {
  return parseTaskIndexItemsFromMarkdown(line, { filePath: "任务.md", fileName: "任务", mtime: 1 })[0];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("task calendar optimistic edit session", () => {
  it("updates the visible task synchronously before Markdown persistence resolves", async () => {
    vi.useFakeTimers();
    const write = deferred<boolean>();
    const persist = vi.fn(() => write.promise);
    const session = new TaskCalendarEditSession({ task: task(), context, persist, shouldSync: () => false, sync: vi.fn() });

    session.apply({ date: "2026-08-11", time: "09:15", priority: "highest" });
    expect(session.getSnapshot()).toMatchObject({
      saveState: "modified",
      task: { dueDate: "2026-08-11", dueTime: "09:15", priority: "highest" }
    });
    expect(persist).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();
    expect(session.getSnapshot().saveState).toBe("saving");
    write.resolve(true);
    await vi.waitFor(() => expect(session.getSnapshot().saveState).toBe("saved"));
  });

  it("serializes rapid edits and applies later fields over the newly persisted line", async () => {
    vi.useFakeTimers();
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const session = new TaskCalendarEditSession({ task: task(), context, persist, shouldSync: () => false, sync: vi.fn() });

    session.apply({ date: "2026-08-11" });
    await vi.runOnlyPendingTimersAsync();
    session.apply({ priority: "high", projectTag: "#项目/康复" });
    expect(session.getSnapshot().task).toMatchObject({ dueDate: "2026-08-11", priority: "high" });

    first.resolve(true);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    expect(persist.mock.calls[1]?.[0]).toMatchObject({ dueDate: "2026-08-11" });
    second.resolve(true);
    await vi.waitFor(() => expect(session.getSnapshot().saveState).toBe("saved"));
    expect(session.getSnapshot().task.line).toContain("#项目/康复");
  });

  it("keeps optimistic values on save failure and retries without reverting the form", async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const session = new TaskCalendarEditSession({ task: task(), context, persist, shouldSync: () => false, sync: vi.fn() });

    session.apply({ reminderTime: "09:00", tags: ["检查", "康复"] });
    await vi.runOnlyPendingTimersAsync();
    await vi.waitFor(() => expect(session.getSnapshot().saveState).toBe("save-failed"));
    expect(session.getSnapshot()).toMatchObject({
      canRetry: true,
      task: { reminderTime: "09:00" }
    });
    expect(session.getSnapshot().task.line).toContain("#检查");

    session.retry();
    await vi.waitFor(() => expect(session.getSnapshot().saveState).toBe("saved"));
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("treats slow Apple sync as status-only and reruns it after a newer edit", async () => {
    vi.useFakeTimers();
    const firstSync = deferred<boolean>();
    const secondSync = deferred<boolean>();
    const sync = vi.fn()
      .mockImplementationOnce(() => firstSync.promise)
      .mockImplementationOnce(() => secondSync.promise);
    const session = new TaskCalendarEditSession({ task: task(), context, persist: vi.fn().mockResolvedValue(true), shouldSync: () => true, sync });

    session.apply({ time: "10:00" });
    await vi.runOnlyPendingTimersAsync();
    await vi.waitFor(() => expect(session.getSnapshot().syncState).toBe("syncing"));
    session.apply({ time: "10:30" });
    expect(session.getSnapshot().task.dueTime).toBe("10:30");

    await vi.runOnlyPendingTimersAsync();
    firstSync.resolve(true);
    await vi.waitFor(() => expect(session.getSnapshot().saveState).toBe("saved"));
    await vi.runOnlyPendingTimersAsync();
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    secondSync.resolve(false);
    await vi.waitFor(() => expect(session.getSnapshot().syncState).toBe("sync-failed"));
    expect(session.getSnapshot().task.dueTime).toBe("10:30");
  });

  it("supports a short title debounce without delaying the input value", async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue(true);
    const session = new TaskCalendarEditSession({ task: task(), context, persist, shouldSync: () => false, sync: vi.fn() });
    session.apply({ title: "测试任务新标题" }, 260);
    expect(session.getSnapshot().task.title).toBe("测试任务新标题");
    await vi.advanceTimersByTimeAsync(259);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
  });
});
