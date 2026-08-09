import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  appleSyncRecordKey,
  attachAppleSyncId,
  extractAppleSyncId,
  formatImportedAppleTask,
  normalizeAppleSyncState,
  remoteAppleSyncSignature,
  resolveAppleSyncDirection,
  shouldSyncTask,
  updateTaskLineFromApple,
  type AppleSyncRecord,
  type AppleSyncRemoteItem
} from "../src/appleSync";
import { AppleSyncService } from "../src/appleSyncService";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";
import type { AppleSyncBridge } from "../src/appleSyncBridge";
import type { TaskIndex } from "../src/taskIndex";

vi.mock("obsidian", () => ({
  App: class {},
  Modal: class {},
  Notice: class {},
  Platform: { isMobile: false },
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

const remoteReminder: AppleSyncRemoteItem = {
  kind: "reminders",
  id: "remote-1",
  localId: "local-1",
  title: "Apple 修改后的任务",
  completed: true,
  dueDate: "2026-08-08",
  dueTime: "14:30",
  priority: 1,
  modifiedAt: "2026-08-01T02:00:00.000Z",
  notes: "memos-plus-id:local-1"
};

describe("Apple sync safety and merge helpers", () => {
  it("is opt-in and scoped to an explicit tag by default", () => {
    expect(DEFAULT_SETTINGS.appleSyncEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.appleSyncTag).toBe("#Apple同步");
    expect(DEFAULT_SETTINGS.appleSyncOnStartup).toBe(false);
    expect(shouldSyncTask({ line: "- [ ] 普通任务" }, "#Apple同步")).toBe(false);
    expect(shouldSyncTask({ line: "- [ ] 同步任务 #Apple同步" }, "#Apple同步")).toBe(true);
  });

  it("normalizes old data without enabling Apple access or discarding existing state", () => {
    const normalized = normalizeSettings({ language: "en", appleSyncState: { records: {}, lastSyncAt: "2026-08-01", lastError: "" } });
    expect(normalized.language).toBe("en");
    expect(normalized.appleSyncEnabled).toBe(false);
    expect(normalized.appleSyncState.lastSyncAt).toBe("2026-08-01");
  });

  it("adds a stable hidden marker without duplicating it", () => {
    const first = attachAppleSyncId("- [ ] 任务 #Apple同步", "abc-123");
    expect(extractAppleSyncId(first)).toBe("abc-123");
    expect(attachAppleSyncId(first, "abc-123")).toBe(first);
  });

  it("uses three-way signatures for bidirectional conflict resolution", () => {
    const record: AppleSyncRecord = {
      localId: "local-1",
      kind: "reminders",
      remoteId: "remote-1",
      localSignature: "old-local",
      remoteSignature: "old-remote",
      lastSyncedAt: "2026-07-31T00:00:00.000Z"
    };
    expect(resolveAppleSyncDirection("new-local", "old-remote", record, "remote-wins", 0, "")).toBe("push");
    expect(resolveAppleSyncDirection("old-local", "new-remote", record, "local-wins", 0, "")).toBe("pull");
    expect(resolveAppleSyncDirection("new-local", "new-remote", record, "local-wins", 0, "")).toBe("push");
    expect(resolveAppleSyncDirection("new-local", "new-remote", record, "remote-wins", 0, "")).toBe("pull");
    expect(resolveAppleSyncDirection("new-local", "new-remote", record, "newest", Date.parse("2026-08-01T03:00:00Z"), remoteReminder.modifiedAt)).toBe(
      "push"
    );
  });

  it("pulls completion, title, date and priority while preserving unrelated task metadata", () => {
    const line = "- [ ] 旧标题 🔽 ⏳ 2026-08-02 #项目/测试 #Apple同步 <!-- memos-plus-apple-id:local-1 -->";
    const updated = updateTaskLineFromApple(line, remoteReminder, "#Apple同步", "local-1");
    expect(updated).toContain("- [x] Apple 修改后的任务 ⏫ 📅 2026-08-08 ⏰ 14:30");
    expect(updated).toContain("⏳ 2026-08-02");
    expect(updated).toContain("#项目/测试");
    expect(updated.match(/memos-plus-apple-id/g)).toHaveLength(1);
  });

  it("formats remote-only items as tagged Markdown tasks", () => {
    const line = formatImportedAppleTask(remoteReminder, "#Apple同步", "new-local");
    expect(line).toBe("- [x] Apple 修改后的任务 ⏫ 📅 2026-08-08 ⏰ 14:30 #Apple同步 <!-- memos-plus-apple-id:new-local -->");
  });

  it("keeps state records keyed by target and local id", () => {
    const key = appleSyncRecordKey("reminders", "local-1");
    const normalized = normalizeAppleSyncState({
      records: {
        [key]: {
          localId: "local-1",
          kind: "reminders",
          remoteId: "remote-1",
          localSignature: "a",
          remoteSignature: remoteAppleSyncSignature(remoteReminder),
          lastSyncedAt: "now"
        }
      }
    });
    expect(normalized.records[key]?.remoteId).toBe("remote-1");
  });
});

describe("Apple sync source integration", () => {
  const bridgeSource = readFileSync("src/appleSyncBridge.ts", "utf8");
  const serviceSource = readFileSync("src/appleSyncService.ts", "utf8");
  const mainSource = readFileSync("main.ts", "utf8");

  it("uses execFile without a shell and limits deletion to linked reminders", () => {
    expect(bridgeSource).toContain('execFile(\n        "/usr/bin/osascript"');
    expect(bridgeSource).toContain('require("node:child_process")');
    expect(bridgeSource).not.toContain('await import("node:child_process")');
    expect(bridgeSource).not.toContain("shell: true");
    expect(bridgeSource).toContain('request.kind !== "reminders"');
    expect(bridgeSource).toContain("app.delete(matches[0])");
    expect(bridgeSource).not.toContain("deleteEvent");
  });

  it("loads the desktop child-process bridge only after the macOS runtime guard", () => {
    const guardIndex = bridgeSource.indexOf("if (!isMacOsDesktopRuntime())");
    const requireIndex = bridgeSource.indexOf('require("node:child_process")');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(requireIndex).toBeGreaterThan(guardIndex);
  });

  it("does not start Apple access unless the feature is enabled", () => {
    expect(serviceSource).toContain("if (!settings.appleSyncEnabled)");
    expect(mainSource).toContain("this.settings.appleSyncEnabled && this.settings.appleSyncOnStartup");
    expect(mainSource).toContain("!this.settings.appleSyncEnabled || this.settings.appleSyncIntervalMinutes <= 0");
  });

  it("rejects a disabled sync before rebuilding the task index or calling Apple", async () => {
    const bridge: AppleSyncBridge = {
      probe: vi.fn(),
      createContainer: vi.fn(),
      list: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn()
    };
    const rebuild = vi.fn();
    const service = new AppleSyncService({
      app: {} as never,
      taskIndex: { rebuild } as unknown as TaskIndex,
      bridge,
      getSettings: () => ({ ...DEFAULT_SETTINGS, appleSyncEnabled: false }),
      persistSettings: vi.fn()
    });

    await expect(service.syncNow()).rejects.toThrow("Apple sync is disabled");
    expect(rebuild).not.toHaveBeenCalled();
    expect(bridge.probe).not.toHaveBeenCalled();
    expect(bridge.list).not.toHaveBeenCalled();
    expect(bridge.upsert).not.toHaveBeenCalled();
  });

  it("probes only the selected Apple target and offers explicit container creation", () => {
    expect(bridgeSource).toContain('probe(request.kind)');
    expect(bridgeSource).toContain('if (kind === "calendar")');
    expect(bridgeSource).toContain('operation: "create-container"');
    expect(bridgeSource).toContain('app.Calendar({ name: name })');
    expect(bridgeSource).toContain('app.List({ name: name })');
    expect(mainSource).toContain('this.appleSync.probe(target)');
    expect(mainSource).toContain('createAppleSyncContainer');
  });

  it("validates the Apple container before writing local sync ids", () => {
    const remoteListIndex = serviceSource.indexOf("const remoteItems = await this.options.bridge.list(kind, container)");
    const ensureIdsIndex = serviceSource.indexOf("localTasks = await this.ensureLocalIds(localTasks)");
    expect(remoteListIndex).toBeGreaterThan(-1);
    expect(ensureIdsIndex).toBeGreaterThan(remoteListIndex);
  });

  it("keeps task sync on Reminders while Calendar remains an agenda concern", () => {
    expect(serviceSource).toContain('const kind = "reminders" as const');
    expect(serviceSource).toContain("const container = settings.appleRemindersList");
    expect(serviceSource).not.toContain("const kind = settings.appleSyncTarget");
    expect(serviceSource).toContain("this.options.bridge.remove(kind, container, remote.id)");
  });

  it("registers manual sync and connection-test commands", () => {
    expect(mainSource).toContain('id: "sync-apple-now"');
    expect(mainSource).toContain('id: "test-apple-sync"');
  });
});
