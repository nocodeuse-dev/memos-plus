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
  list = vi.fn(async (kind: AppleSyncTarget, container: string) => this.items
    .filter((item) => item.kind === kind && (item.container ?? "提醒") === container)
    .map((item) => ({ ...item, container })));
  listMany = vi.fn(async (kind: AppleSyncTarget, containers: string[]) => this.items
    .filter((item) => item.kind === kind && containers.includes(item.container ?? "提醒"))
    .map((item) => ({ ...item, container: item.container ?? "提醒" })));

  upsert = vi.fn(async (input: AppleSyncUpsertInput): Promise<AppleSyncRemoteItem> => {
    const existing = input.remoteId ? this.items.find((item) => item.id === input.remoteId) : undefined;
    const next: AppleSyncRemoteItem = {
      kind: input.kind,
      container: input.container,
      id: existing?.id ?? `remote-${++this.sequence}`,
      localId: input.localId,
      title: input.title,
      completed: input.completed,
      completionDate: input.completed ? "2026-08-11" : "",
      completionAt: input.completed ? "2026-08-11T09:30:15" : "",
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
  it("self-heals duplicated legacy metadata before the first Apple write", async () => {
    const encoded = encodeURIComponent(JSON.stringify({ target: "reminders", dueTime: "17:30", reminderMinutesBefore: 30 }));
    const legacy = `<!-- memos-plus-task- meta:${encoded} -->`;
    const canonical = `<!-- memos-plus-task-meta:${encoded} -->`;
    const test = harness(`- [ ] 被污染任务 ${legacy.repeat(256)} 📅 2026-08-14 ⏰ 17:30 #Apple同步 ${canonical}\n`);

    const first = await test.service.syncNow();
    const second = await test.service.syncNow();
    const source = test.vault.source("Tasks.md");
    const record = Object.values(test.settings.appleSyncState.records)[0];

    expect(first.pushed).toBe(1);
    expect(second.unchanged).toBe(1);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.bridge.items[0]?.title).toBe("被污染任务");
    expect(source).not.toContain("memos-plus-task- meta:");
    expect(source.match(/memos-plus-task-meta:/gu)).toHaveLength(1);
    expect(record?.localSignature).not.toContain("memos-plus-task- meta:");
    expect(record?.remoteSignature).not.toContain("memos-plus-task- meta:");
    expect(record?.localSignature.length).toBeLessThan(4_096);
    expect(record?.remoteSignature.length).toBeLessThan(4_096);
  });

  it("cleans an already polluted Apple title once and then remains unchanged", async () => {
    const test = harness("- [ ] 远端自愈 📅 2026-08-14 #Apple同步\n");
    await test.service.syncNow();
    const encoded = encodeURIComponent(JSON.stringify({ target: "reminders", dueTime: "17:30" }));
    const legacy = `<!-- memos-plus-task- meta:${encoded} -->`;
    test.bridge.items[0] = {
      ...test.bridge.items[0]!,
      title: `远端自愈 ${legacy.repeat(64)}`,
      modifiedAt: "2026-08-11T02:00:00.000Z"
    };

    const repaired = await test.service.syncNow();
    const stable = await test.service.syncNow();

    expect(repaired.pushed).toBe(1);
    expect(stable.unchanged).toBe(1);
    expect(test.bridge.items).toHaveLength(1);
    expect(test.bridge.items[0]?.title).toBe("远端自愈");
    const record = Object.values(test.settings.appleSyncState.records)[0];
    expect(record?.localSignature.length).toBeLessThan(4_096);
    expect(record?.remoteSignature.length).toBeLessThan(4_096);
  });

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

  it("imports new incomplete reminders from additional lists without bulk-importing completed history", async () => {
    const test = harness();
    test.settings.appleRemindersList = "Memos Plus";
    test.settings.appleReminderImportLists = ["提醒"];
    test.bridge.items.push(
      {
        kind: "reminders",
        container: "提醒",
        id: "mac-open-1",
        localId: "",
        title: "Mac 新提醒",
        completed: false,
        dueDate: "2026-08-15",
        dueTime: "21:30",
        priority: 0,
        modifiedAt: "2026-08-15T10:00:00.000Z",
        notes: ""
      },
      {
        kind: "reminders",
        container: "提醒",
        id: "mac-completed-history",
        localId: "",
        title: "历史已完成",
        completed: true,
        completionDate: "2026-08-01",
        dueDate: "2026-08-01",
        dueTime: "",
        priority: 0,
        modifiedAt: "2026-08-01T10:00:00.000Z",
        notes: ""
      }
    );

    const first = await test.service.syncNow();
    const second = await test.service.syncNow();
    const source = test.vault.source("Apple Sync Test.md");
    const record = Object.values(test.settings.appleSyncState.records).find((item) => item.remoteId === "mac-open-1");

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(source).toContain("Mac 新提醒 📅 2026-08-15 ⏰ 21:30 #Apple同步");
    expect(source).not.toContain("历史已完成");
    expect(record?.container).toBe("提醒");
    expect(test.bridge.listMany).toHaveBeenCalledWith("reminders", ["Memos Plus", "提醒"]);
    expect(test.bridge.upsert).toHaveBeenCalledWith(expect.objectContaining({ container: "提醒", remoteId: "mac-open-1" }));

    test.bridge.items.push({
      kind: "reminders",
      container: "提醒",
      id: "mac-open-2",
      localId: "",
      title: "稍后新建的提醒",
      completed: false,
      dueDate: "2026-08-16",
      dueTime: "09:00",
      priority: 0,
      modifiedAt: "2026-08-15T11:00:00.000Z",
      notes: ""
    });
    const later = await test.service.syncNow();
    expect(later.imported).toBe(1);
    expect(test.vault.source("Apple Sync Test.md").match(/稍后新建的提醒/gu)).toHaveLength(1);

    const imported = test.bridge.items.find((item) => item.id === "mac-open-1")!;
    test.bridge.items[test.bridge.items.indexOf(imported)] = {
      ...imported,
      title: "Mac 修改后的提醒",
      modifiedAt: "2026-08-16T10:00:00.000Z"
    };
    const pulled = await test.service.syncNow();
    expect(pulled.pulled).toBe(1);
    expect(test.vault.source("Apple Sync Test.md")).toContain("Mac 修改后的提醒");
    expect(Object.values(test.settings.appleSyncState.records).find((item) => item.remoteId === "mac-open-1")?.container).toBe("提醒");

    const upsertCalls = test.bridge.upsert.mock.calls.length;
    test.settings.appleReminderImportLists = [];
    const paused = await test.service.syncNow();
    expect(paused.skipped).toBeGreaterThan(0);
    expect(test.bridge.upsert).toHaveBeenCalledTimes(upsertCalls);
    expect(test.bridge.remove).not.toHaveBeenCalled();
    expect(test.vault.source("Apple Sync Test.md")).toContain("Mac 修改后的提醒");
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
    test.bridge.listMany.mockRejectedValueOnce(new Error("Apple 提醒事项仍在等待 iCloud 返回，请稍后自动重试。"));

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

  it("backfills an Apple completion date for already-linked completed tasks", async () => {
    const test = harness("- [x] 已完成但缺少完成日期 📅 2026-08-11 #Apple同步\n");

    await test.service.syncNow();
    expect(test.vault.source("Tasks.md")).not.toContain("✅ 2026-08-11");

    const backfill = await test.service.syncNow();
    expect(backfill.pulled).toBe(1);
    expect(test.vault.source("Tasks.md")).toContain("✅ 2026-08-11");
    expect(test.bridge.items).toHaveLength(1);
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
      completionDate: "2026-08-11",
      completionAt: "2026-08-11T18:22:33",
      dueDate: "2026-08-12",
      dueTime: "18:20",
      priority: 9,
      modifiedAt: "2099-01-01T00:00:00.000Z"
    };

    const pull = await test.service.syncNow();
    expect(pull.pulled).toBe(1);
    expect(test.vault.source("Tasks.md")).toContain("- [x] Apple 修改 🔽 📅 2026-08-12 ⏰ 18:20");
    expect(test.vault.source("Tasks.md")).toContain("#Apple同步");
    expect(test.vault.source("Tasks.md")).toContain("✅ 2026-08-11");
    expect(test.vault.source("Tasks.md")).toContain("2026-08-11T18%3A22%3A33");
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
