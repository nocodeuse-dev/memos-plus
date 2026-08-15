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
  taskTitleForApple,
  updateTaskLineFromApple,
  type AppleSyncRecord,
  type AppleSyncRemoteItem
} from "../src/appleSync";
import { AppleSyncService } from "../src/appleSyncService";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";
import { normalizeAppleBridgeError, type AppleSyncBridge } from "../src/appleSyncBridge";
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
  completionDate: "2026-08-11",
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
    expect(normalized.appleSyncState.pending).toEqual({});
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
    expect(updated).toContain("✅ 2026-08-11");
    expect(updated).toContain("⏳ 2026-08-02");
    expect(updated).toContain("#项目/测试");
    expect(updated.match(/memos-plus-apple-id/g)).toHaveLength(1);
  });

  it("keeps recurring history and creates one unlinked next occurrence after Apple completion", () => {
    const line = "- [ ] Apple 重复任务 🔁 every day 📅 2026-08-08 #Apple同步 <!-- memos-plus-apple-id:local-1 -->";
    const updated = updateTaskLineFromApple(line, remoteReminder, "#Apple同步", "local-1");
    const lines = updated.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("- [x] Apple 修改后的任务");
    expect(lines[1]).toContain("- [ ] Apple 修改后的任务");
    expect(lines[1]).toContain("📅 2026-08-09");
    expect(lines[1]).not.toContain("memos-plus-apple-id:local-1");
  });

  it("formats remote-only items as tagged Markdown tasks", () => {
    const line = formatImportedAppleTask(remoteReminder, "#Apple同步", "new-local");
    expect(line).toContain("- [x] Apple 修改后的任务 ⏫ 📅 2026-08-08 ⏰ 14:30");
    expect(line).toContain("#Apple同步 <!-- memos-plus-apple-id:new-local -->");
    expect(line).toContain("✅ 2026-08-11");
    expect(line).toContain("memos-plus-task-meta:");
  });

  it("keeps workspace-only task details out of the Apple Reminder title", () => {
    const detail = encodeURIComponent(JSON.stringify({ notes: "影像资料", relatedNote: "半月板.md" }));
    expect(taskTitleForApple({ text: `测试任务 📅 2026-08-10 #Apple同步 <!-- memos-plus-task-detail:${detail} -->` }, "#Apple同步")).toBe("测试任务");
    expect(taskTitleForApple({ text: "修复同步 #项目/memosplus 📅 2026-08-10 #项目/memosplus #Apple同步" }, "#Apple同步")).toBe("修复同步 #项目/memosplus");
  });

  it("does not duplicate a project tag when Apple already includes the preserved local tag", () => {
    const line = "- [ ] 旧标题 📅 2026-08-10 #项目/memosplus #Apple同步 <!-- memos-plus-apple-id:local-1 -->";
    const remote = { ...remoteReminder, title: "新标题 #项目/memosplus" };
    const updated = updateTaskLineFromApple(line, remote, "#Apple同步", "local-1");
    expect(updated.match(/#项目\/memosplus/gu)).toHaveLength(1);
  });

  it("removes legacy duplicated task metadata from local and remote titles idempotently", () => {
    const encoded = encodeURIComponent(JSON.stringify({ target: "reminders", dueTime: "14:30" }));
    const legacy = `<!-- memos-plus-task- meta:${encoded} -->`;
    const detail = "<!-- memos-plus-task-detail:%7B%22notes%22%3A%22保留%22%7D -->";
    const line = `- [ ] 旧标题 ${legacy.repeat(6)} #项目/测试 #Apple同步 ${detail} <!-- memos-plus-apple-id:local-1 --> <!-- memos-plus-task-meta:${encoded} -->`;
    const pollutedRemote = { ...remoteReminder, completed: false, completionDate: "", title: `Apple 干净标题 ${legacy.repeat(3)}` };

    expect(taskTitleForApple({ text: line.replace(/^- \[ \] /u, "") }, "#Apple同步")).toBe("旧标题 #项目/测试");
    const first = updateTaskLineFromApple(line, pollutedRemote, "#Apple同步", "local-1");
    let repeated = first;
    for (let index = 0; index < 12; index += 1) repeated = updateTaskLineFromApple(repeated, pollutedRemote, "#Apple同步", "local-1");

    expect(repeated).toBe(first);
    expect(first).not.toContain("memos-plus-task- meta:");
    expect(first.match(/memos-plus-task-meta:/gu)).toHaveLength(1);
    expect(first.match(/memos-plus-apple-id:/gu)).toHaveLength(1);
    expect(first.match(/#Apple同步/gu)).toHaveLength(1);
    expect(first).toContain("#项目/测试");
    expect(first).toContain("memos-plus-task-detail:");
  });

  it("keeps state records keyed by target and local id", () => {
    const key = appleSyncRecordKey("reminders", "local-1");
    const normalized = normalizeAppleSyncState({
      records: {
        [key]: {
          localId: "local-1",
          kind: "reminders",
          container: "提醒",
          remoteId: "remote-1",
          localSignature: "a",
          remoteSignature: remoteAppleSyncSignature(remoteReminder),
          lastSyncedAt: "now"
        }
      }
    });
    expect(normalized.records[key]?.remoteId).toBe("remote-1");
    expect(normalized.records[key]?.container).toBe("提醒");
  });
});

describe("Apple sync source integration", () => {
  const bridgeSource = readFileSync("src/appleSyncBridge.ts", "utf8");
  const serviceSource = readFileSync("src/appleSyncService.ts", "utf8");
  const mainSource = readFileSync("main.ts", "utf8");

  it("uses the bounded stdin JXA runner and limits deletion to linked reminders", () => {
    const runnerSource = readFileSync("src/appleJxaRunner.ts", "utf8");
    expect(bridgeSource).toContain("runAppleJxa<T>(APPLE_SYNC_JXA, request");
    expect(runnerSource).toContain('args: ["-l", "JavaScript"]');
    expect(runnerSource).toContain("child.stdin.end(invocation.input");
    expect(runnerSource).toContain('require("node:child_process")');
    expect(runnerSource).not.toContain('await import("node:child_process")');
    expect(bridgeSource).not.toContain("shell: true");
    expect(bridgeSource).toContain('request.kind !== "reminders"');
    expect(bridgeSource).toContain("app.delete(reminder)");
    expect(bridgeSource).toContain("reminderByLocalId(list, request.localId)");
    expect(bridgeSource).not.toContain("deleteEvent");
  });

  it("batch-reads Reminder properties and leaves enough time for iCloud responses", () => {
    expect(bridgeSource).toContain("const ids = safeArray(function () { return reminders.id(); });");
    expect(bridgeSource).toContain("const bodies = safeArray(function () { return reminders.body(); });");
    expect(bridgeSource).toContain("const completionDates = safeArray(function () { return reminders.completionDate(); });");
    expect(bridgeSource).toContain("reminderRecordFromValues");
    expect(bridgeSource).toContain("listReminderItemsMany");
    expect(bridgeSource).toContain("containers: unique");
    expect(bridgeSource).toContain("timeoutMs: 60_000");
    expect(bridgeSource).toContain("Apple 提醒事项仍在等待 iCloud 返回，请稍后自动重试。");
  });

  it("loads the shared child-process runner only after the macOS runtime guard", () => {
    const guardIndex = bridgeSource.indexOf("if (!isMacOsDesktopRuntime())");
    const runnerIndex = bridgeSource.indexOf("return runAppleJxa<T>");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(runnerIndex).toBeGreaterThan(guardIndex);
  });

  it("turns raw oversized-process errors into an actionable message", () => {
    expect(normalizeAppleBridgeError("spawn /usr/bin/osascript E2BIG")).toContain("过大的 Apple 同步请求");
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

  it("maps precise Reminder alerts and explicit Calendar time ranges in the macOS bridge", () => {
    expect(bridgeSource).toContain("reminder.remindMeDate = remindDate");
    expect(bridgeSource).toContain("request.reminderMinutesBefore");
    expect(bridgeSource).toContain("request.endTime || request.dueTime");
    expect(bridgeSource).toContain("event.alldayEvent = allDay");
    expect(bridgeSource).toContain("event.recurrence = recurrence");
  });

  it("validates the Apple container before writing local sync ids", () => {
    const remoteListIndex = serviceSource.indexOf("const remoteItems = await this.listRemoteReminders(reminderContainers)");
    const ensureIdsIndex = serviceSource.indexOf("localTasks = await this.ensureLocalIds(localTasks,");
    expect(remoteListIndex).toBeGreaterThan(-1);
    expect(ensureIdsIndex).toBeGreaterThan(remoteListIndex);
  });

  it("keeps ordinary tasks on Reminders and exports only explicit Calendar-target tasks", () => {
    expect(serviceSource).toContain('const kind = "reminders" as const');
    expect(serviceSource).toContain("const container = settings.appleRemindersList");
    expect(serviceSource).not.toContain("const kind = settings.appleSyncTarget");
    expect(serviceSource).toContain("this.options.bridge.remove(kind, reminderContainer(remote, record.container || container), remote.id, record.localId)");
    expect(serviceSource).toContain("findRemoteForRecord");
    expect(serviceSource).toContain("markAppleSyncPending");
    expect(mainSource).toContain("scheduleAppleSyncRetry");
    expect(serviceSource).toContain("shouldSyncCalendarTask");
    expect(serviceSource).toContain("container: settings.appleCalendarName");
  });

  it("registers manual sync and connection-test commands", () => {
    expect(mainSource).toContain('id: "sync-apple-now"');
    expect(mainSource).toContain('id: "test-apple-sync"');
  });
});
