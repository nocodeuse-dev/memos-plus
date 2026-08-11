import { describe, expect, it, vi } from "vitest";

const { MockTFile } = vi.hoisted(() => ({
  MockTFile: class MockTFile {
    extension = "md";
    stat = { mtime: 1 };
    name: string;
    basename: string;

    constructor(public path: string) {
      this.name = path.split("/").pop() ?? path;
      this.basename = this.name.replace(/\.md$/i, "");
    }
  }
}));

vi.mock("obsidian", () => ({
  App: class {},
  Modal: class {},
  Notice: class {},
  Platform: { isMobile: false },
  PluginSettingTab: class {},
  Setting: class {},
  TFile: MockTFile,
  TFolder: class {},
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

import { APPLE_SYNC_MISSING_GRACE_MS, AppleSyncService } from "../src/appleSyncService";
import type { AppleSyncBridge, AppleSyncUpsertInput } from "../src/appleSyncBridge";
import type { AppleSyncRemoteItem, AppleSyncTarget } from "../src/appleSync";
import { DEFAULT_SETTINGS, type MemosPlusSettings } from "../src/settings";
import { TaskIndex } from "../src/taskIndex";
import { buildTasksMarkdownLine } from "../src/tasksFormat";

class MemoryVault {
  private readonly files = new Map<string, { file: InstanceType<typeof MockTFile>; source: string }>();
  private readonly folders = new Set<string>();
  private mtime = 1;

  add(path: string, source: string): void {
    this.files.set(path, { file: new MockTFile(path), source });
  }

  source(path: string): string {
    return this.files.get(path)?.source ?? "";
  }

  setSource(path: string, source: string): void {
    const entry = this.files.get(path);
    if (!entry) throw new Error(`Missing file: ${path}`);
    entry.source = source;
    entry.file.stat.mtime = ++this.mtime;
  }

  getAbstractFileByPath = (path: string): InstanceType<typeof MockTFile> | { path: string } | null =>
    this.files.get(path)?.file ?? (this.folders.has(path) ? { path } : null);

  getMarkdownFiles = (): InstanceType<typeof MockTFile>[] => Array.from(this.files.values()).map((entry) => entry.file);

  cachedRead = async (file: InstanceType<typeof MockTFile>): Promise<string> => this.source(file.path);

  process = async (file: InstanceType<typeof MockTFile>, change: (source: string) => string): Promise<void> => {
    this.setSource(file.path, change(this.source(file.path)));
  };

  append = async (file: InstanceType<typeof MockTFile>, content: string): Promise<void> => {
    this.setSource(file.path, this.source(file.path) + content);
  };

  create = async (path: string, source: string): Promise<InstanceType<typeof MockTFile>> => {
    this.add(path, source);
    return this.files.get(path)!.file;
  };

  createFolder = async (path: string): Promise<void> => {
    this.folders.add(path);
  };
}

class MemoryRemindersBridge implements AppleSyncBridge {
  items: AppleSyncRemoteItem[] = [];
  removeCalls: string[] = [];
  private sequence = 0;

  probe = vi.fn(async () => ({ reminderLists: ["提醒"], calendars: [], defaultReminderList: "提醒" }));
  createContainer = vi.fn(async (_kind: AppleSyncTarget, name: string) => ({ name, writable: true }));
  list = vi.fn(async (kind: AppleSyncTarget) => this.items.filter((item) => item.kind === kind).map((item) => ({ ...item })));

  upsert = vi.fn(async (input: AppleSyncUpsertInput): Promise<AppleSyncRemoteItem> => {
    const existing = input.remoteId ? this.items.find((item) => item.id === input.remoteId) : undefined;
    const next: AppleSyncRemoteItem = {
      kind: input.kind,
      id: existing?.id ?? `remote-${++this.sequence}`,
      localId: input.localId,
      title: input.title,
      completed: input.completed,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      reminderDate: input.reminderDate,
      reminderTime: input.reminderTime,
      reminderMinutesBefore: input.reminderMinutesBefore,
      allDay: input.allDay,
      endDate: input.endDate,
      endTime: input.endTime,
      recurrence: input.recurrence,
      priority: input.priority,
      modifiedAt: new Date(Date.now() + this.sequence * 1_000).toISOString(),
      notes: `memos-plus-id:${input.localId}`
    };
    if (existing) this.items[this.items.indexOf(existing)] = next;
    else this.items.push(next);
    return { ...next };
  });

  remove = vi.fn(async (_kind: AppleSyncTarget, _container: string, remoteId: string) => {
    this.removeCalls.push(remoteId);
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== remoteId);
    return this.items.length !== before;
  });
}

function harness(source = ""): {
  vault: MemoryVault;
  bridge: MemoryRemindersBridge;
  settings: MemosPlusSettings;
  taskIndex: TaskIndex;
  service: AppleSyncService;
  advance: (milliseconds: number) => void;
} {
  const vault = new MemoryVault();
  if (source) vault.add("Tasks.md", source);
  const bridge = new MemoryRemindersBridge();
  const settings: MemosPlusSettings = {
    ...DEFAULT_SETTINGS,
    appleSyncEnabled: true,
    appleRemindersList: "提醒",
    appleSyncInboxPath: "Apple Sync Test.md",
    appleSyncState: { records: {}, pending: {}, lastSyncAt: "", lastError: "" }
  };
  let now = Date.parse("2026-08-11T00:00:00.000Z");
  const app = { vault } as never;
  const taskIndex = new TaskIndex(app, { isMobile: () => false });
  const service = new AppleSyncService({
    app,
    taskIndex,
    bridge,
    getSettings: () => settings,
    persistSettings: vi.fn(async () => undefined),
    isAvailable: () => true,
    now: () => now
  });
  return { vault, bridge, settings, taskIndex, service, advance: (milliseconds) => { now += milliseconds; } };
}

async function finishMissingGrace(test: ReturnType<typeof harness>): Promise<void> {
  test.advance(APPLE_SYNC_MISSING_GRACE_MS / 2);
  await test.service.syncNow();
  test.advance(APPLE_SYNC_MISSING_GRACE_MS / 2 + 1);
}

describe("Apple Reminders bidirectional synchronization", () => {
  it("imports an Apple reminder once and keeps its stable identifier", async () => {
    const test = harness();
    test.bridge.items.push({
      kind: "reminders",
      id: "apple-1",
      localId: "",
      title: "Apple 新建",
      completed: false,
      dueDate: "2026-08-10",
      dueTime: "14:30",
      priority: 5,
      modifiedAt: "2026-08-09T10:00:00.000Z",
      notes: ""
    });

    const first = await test.service.syncNow();
    const second = await test.service.syncNow();

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(test.vault.source("Apple Sync Test.md")).toContain("Apple 新建 🔼 📅 2026-08-10 ⏰ 14:30 #Apple同步");
    expect(test.vault.source("Apple Sync Test.md").match(/memos-plus-apple-id:/g)).toHaveLength(1);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.bridge.items[0]?.localId).not.toBe("");
  });

  it("reassociates the same iCloud reminder when its device-local identifier changes", async () => {
    const test = harness("- [ ] 跨设备任务 📅 2026-08-12 #Apple同步\n");
    await test.service.syncNow();
    const localId = test.bridge.items[0]!.localId;
    test.bridge.items[0] = { ...test.bridge.items[0]!, id: "other-mac-id", modifiedAt: "2026-08-11T01:00:00.000Z" };

    const result = await test.service.syncNow();

    expect(result.waiting).toBe(0);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.settings.appleSyncState.records[`reminders:${localId}`]?.remoteId).toBe("other-mac-id");
  });

  it("uses the last remote signature to restore a missing iCloud marker without creating a duplicate", async () => {
    const test = harness("- [ ] 重新关联 📅 2026-08-12 #Apple同步\n");
    await test.service.syncNow();
    const original = test.bridge.items[0]!;
    test.bridge.items[0] = { ...original, id: "changed-id", localId: "", notes: "" };

    await test.service.syncNow();

    expect(test.bridge.items).toHaveLength(1);
    expect(test.bridge.items[0]).toMatchObject({ id: "changed-id", localId: original.localId });
    expect(test.settings.appleSyncState.records[`reminders:${original.localId}`]?.remoteId).toBe("changed-id");
  });

  it("keeps a temporarily missing reminder in waiting state and reconnects after iCloud catches up", async () => {
    const test = harness("- [ ] 等待 iCloud 📅 2026-08-12 #Apple同步\n");
    await test.service.syncNow();
    const remote = test.bridge.items[0]!;
    test.bridge.items = [];

    const waiting = await test.service.syncNow();
    expect(waiting.waiting).toBe(1);
    expect(waiting.deletedLocal).toBe(0);
    expect(test.settings.appleSyncState.lastError).toBe("");
    expect(test.vault.source("Tasks.md")).toContain("等待 iCloud");

    test.bridge.items = [{ ...remote, id: "icloud-new-id" }];
    const recovered = await test.service.syncNow();
    expect(recovered.waiting).toBe(0);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.settings.appleSyncState.pending[`reminders:${remote.localId}`]).toBeUndefined();
    expect(test.settings.appleSyncState.records[`reminders:${remote.localId}`]?.remoteId).toBe("icloud-new-id");
  });

  it("classifies an iCloud list timeout as waiting and retries without recording a sync failure", async () => {
    const localId = "timeout-local-id";
    const test = harness(`- [ ] iCloud 读取中 #Apple同步 <!-- memos-plus-apple-id:${localId} -->\n`);
    test.bridge.list.mockRejectedValueOnce(new Error("Apple 提醒事项仍在等待 iCloud 返回，请稍后自动重试。"));

    const result = await test.service.syncNow();

    expect(result.waiting).toBe(1);
    expect(test.settings.appleSyncState.lastError).toBe("");
    expect(test.settings.appleSyncState.pending[`reminders:${localId}`]?.reason).toBe("remote-missing");
    expect(test.bridge.upsert).not.toHaveBeenCalled();
    expect(test.vault.source("Tasks.md")).toContain("iCloud 读取中");
  });

  it("waits for Markdown from another device when a linked Reminder arrives first", async () => {
    const test = harness();
    const localId = "cross-device-local-id";
    test.bridge.items.push({
      kind: "reminders",
      id: "iphone-reminder-id",
      localId,
      title: "iPhone 创建",
      completed: false,
      dueDate: "2026-08-13",
      dueTime: "09:30",
      priority: 5,
      modifiedAt: "2026-08-11T01:00:00.000Z",
      notes: `memos-plus-id:${localId}`
    });

    const waiting = await test.service.syncNow();
    expect(waiting.waiting).toBe(1);
    expect(waiting.imported).toBe(0);
    expect(test.vault.source("Apple Sync Test.md")).toBe("");

    test.vault.add("Tasks.md", `- [ ] iPhone 创建 🔼 📅 2026-08-13 ⏰ 09:30 #Apple同步 <!-- memos-plus-apple-id:${localId} -->\n`);
    const matched = await test.service.syncNow();
    expect(matched.waiting).toBe(0);
    expect(matched.imported).toBe(0);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.settings.appleSyncState.records[`reminders:${localId}`]?.remoteId).toBe("iphone-reminder-id");
  });

  it("uniquely matches an unmarked Reminder by task fields before creating anything", async () => {
    const localId = "existing-markdown-id";
    const test = harness(`- [ ] 唯一匹配 🔼 📅 2026-08-14 ⏰ 10:30 #Apple同步 <!-- memos-plus-apple-id:${localId} -->\n`);
    test.bridge.items.push({
      kind: "reminders",
      id: "unmarked-icloud-id",
      localId: "",
      title: "唯一匹配",
      completed: false,
      dueDate: "2026-08-14",
      dueTime: "10:30",
      priority: 5,
      modifiedAt: "2026-08-11T01:00:00.000Z",
      notes: ""
    });

    const result = await test.service.syncNow();

    expect(result.waiting).toBe(0);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.bridge.items[0]).toMatchObject({ id: "unmarked-icloud-id", localId });
    expect(test.settings.appleSyncState.records[`reminders:${localId}`]?.remoteId).toBe("unmarked-icloud-id");
  });

  it("pushes local create/edit/complete/delete without duplicate reminders", async () => {
    const test = harness("- [ ] 本地新建 ⏫ 📅 2026-08-11 ⏰ 09:45 #Apple同步\n");

    await test.service.syncNow();
    await test.service.syncNow();
    expect(test.bridge.items).toHaveLength(1);
    expect(test.bridge.items[0]).toMatchObject({ title: "本地新建", completed: false, dueDate: "2026-08-11", dueTime: "09:45", priority: 1 });

    const linkedLine = test.vault.source("Tasks.md").trim();
    test.vault.setSource("Tasks.md", linkedLine.replace("本地新建", "本地修改").replace("- [ ]", "- [x]").replace("09:45", "10:15"));
    await test.service.syncNow();
    expect(test.bridge.items[0]).toMatchObject({ title: "本地修改", completed: true, dueTime: "10:15" });

    test.vault.setSource("Tasks.md", "");
    const waiting = await test.service.syncNow();
    expect(waiting.waiting).toBe(1);
    expect(test.bridge.items).toHaveLength(1);
    await finishMissingGrace(test);
    const deletion = await test.service.syncNow();
    expect(deletion.deletedRemote).toBe(1);
    expect(test.bridge.items).toHaveLength(0);
  });

  it("pushes separate Reminder due and alert times", async () => {
    const line = buildTasksMarkdownLine("精确提醒", {
      syncTarget: "reminders",
      syncTag: "#Apple同步",
      dueDate: "2026-08-11",
      dueTime: "09:45",
      reminderDate: "2026-08-11",
      reminderTime: "09:15",
      reminderMinutesBefore: 30,
      priority: "medium"
    });
    const test = harness(`${line}\n`);
    await test.service.syncNow();
    expect(test.bridge.items[0]).toMatchObject({
      kind: "reminders",
      dueDate: "2026-08-11",
      dueTime: "09:45",
      reminderDate: "2026-08-11",
      reminderTime: "09:15",
      reminderMinutesBefore: 30
    });
  });

  it("exports an explicitly targeted timed task to Calendar only once", async () => {
    const line = buildTasksMarkdownLine("日程会议", {
      syncTarget: "calendar",
      syncTag: "#Apple同步",
      startDate: "2026-08-12",
      startTime: "09:00",
      endTime: "10:30",
      reminderMinutesBefore: 15,
      priority: "none"
    });
    const test = harness(`${line}\n`);
    await test.service.syncNow();
    await test.service.syncNow();
    expect(test.bridge.items).toHaveLength(1);
    expect(test.bridge.items[0]).toMatchObject({
      kind: "calendar",
      dueDate: "2026-08-12",
      dueTime: "09:00",
      endDate: "2026-08-12",
      endTime: "10:30",
      reminderMinutesBefore: 15
    });
  });

  it("pulls Apple edits and deletes only an already-linked local task", async () => {
    const test = harness("- [ ] 待同步 📅 2026-08-11 #Apple同步\n- [ ] 历史本地任务\n");
    await test.service.syncNow();
    const remote = test.bridge.items[0]!;
    test.bridge.items[0] = {
      ...remote,
      title: "Apple 修改",
      completed: true,
      dueDate: "2026-08-12",
      dueTime: "18:20",
      priority: 9,
      modifiedAt: "2099-01-01T00:00:00.000Z"
    };

    const pull = await test.service.syncNow();
    expect(pull.pulled).toBe(1);
    expect(test.vault.source("Tasks.md")).toContain("- [x] Apple 修改 🔽 📅 2026-08-12 ⏰ 18:20 #Apple同步");
    expect(test.vault.source("Tasks.md")).toContain("- [ ] 历史本地任务");

    test.bridge.items = [];
    const waiting = await test.service.syncNow();
    expect(waiting.waiting).toBe(1);
    expect(test.vault.source("Tasks.md")).toContain("Apple 修改");
    await finishMissingGrace(test);
    const deletion = await test.service.syncNow();
    expect(deletion.deletedLocal).toBe(1);
    expect(test.vault.source("Tasks.md")).not.toContain("Apple 修改");
    expect(test.vault.source("Tasks.md")).toContain("历史本地任务");
  });

  it("treats removing the sync tag as opt-out rather than deletion", async () => {
    const test = harness("- [ ] 保留我 #Apple同步\n");
    await test.service.syncNow();
    test.vault.setSource("Tasks.md", test.vault.source("Tasks.md").replace(" #Apple同步", ""));

    const result = await test.service.syncNow();
    expect(result.deletedRemote).toBe(0);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.vault.source("Tasks.md")).toContain("保留我");
  });

  it("defers deletion while the task index snapshot is incomplete", async () => {
    const test = harness("- [ ] 安全删除 #Apple同步\n");
    await test.service.syncNow();
    test.vault.setSource("Tasks.md", "");
    const status = vi.spyOn(test.taskIndex, "getStatus").mockReturnValue({
      indexedTasks: 0,
      indexedFiles: 0,
      updatedAt: "",
      updating: true,
      cacheState: "updating",
      failedFiles: []
    });

    const deferred = await test.service.syncNow();
    expect(deferred.deletedRemote).toBe(0);
    expect(test.bridge.items).toHaveLength(1);

    status.mockRestore();
    const waiting = await test.service.syncNow();
    expect(waiting.waiting).toBe(1);
    await finishMissingGrace(test);
    const removed = await test.service.syncNow();
    expect(removed.deletedRemote).toBe(1);
    expect(test.bridge.items).toHaveLength(0);
  });
});
