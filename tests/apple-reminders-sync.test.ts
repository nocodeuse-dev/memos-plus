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

import { AppleSyncService } from "../src/appleSyncService";
import type { AppleSyncBridge, AppleSyncUpsertInput } from "../src/appleSyncBridge";
import type { AppleSyncRemoteItem, AppleSyncTarget } from "../src/appleSync";
import { DEFAULT_SETTINGS, type MemosPlusSettings } from "../src/settings";
import { TaskIndex } from "../src/taskIndex";

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
  list = vi.fn(async () => this.items.map((item) => ({ ...item })));

  upsert = vi.fn(async (input: AppleSyncUpsertInput): Promise<AppleSyncRemoteItem> => {
    const existing = input.remoteId ? this.items.find((item) => item.id === input.remoteId) : undefined;
    const next: AppleSyncRemoteItem = {
      kind: "reminders",
      id: existing?.id ?? `remote-${++this.sequence}`,
      localId: input.localId,
      title: input.title,
      completed: input.completed,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
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
} {
  const vault = new MemoryVault();
  if (source) vault.add("Tasks.md", source);
  const bridge = new MemoryRemindersBridge();
  const settings: MemosPlusSettings = {
    ...DEFAULT_SETTINGS,
    appleSyncEnabled: true,
    appleRemindersList: "提醒",
    appleSyncInboxPath: "Apple Sync Test.md",
    appleSyncState: { records: {}, lastSyncAt: "", lastError: "" }
  };
  const app = { vault } as never;
  const taskIndex = new TaskIndex(app, { isMobile: () => false });
  const service = new AppleSyncService({
    app,
    taskIndex,
    bridge,
    getSettings: () => settings,
    persistSettings: vi.fn(async () => undefined),
    isAvailable: () => true
  });
  return { vault, bridge, settings, taskIndex, service };
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
    const deletion = await test.service.syncNow();
    expect(deletion.deletedRemote).toBe(1);
    expect(test.bridge.items).toHaveLength(0);
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
    const removed = await test.service.syncNow();
    expect(removed.deletedRemote).toBe(1);
    expect(test.bridge.items).toHaveLength(0);
  });
});
