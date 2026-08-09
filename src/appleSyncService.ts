import { Platform, TFile, normalizePath, type App } from "obsidian";
import {
  appleSyncRecordKey,
  appleTitleForKind,
  attachAppleSyncId,
  extractAppleSyncId,
  formatImportedAppleTask,
  localAppleSyncSignature,
  normalizeAppleSyncState,
  remoteAppleSyncSignature,
  resolveAppleSyncDirection,
  shouldSyncCalendarTask,
  shouldSyncTask,
  taskPriorityToApple,
  taskTimeForApple,
  taskReminderForApple,
  taskTitleForApple,
  updateTaskLineFromApple,
  type AppleSyncRecord,
  type AppleSyncRemoteItem
} from "./appleSync";
import { parseMemosPlusTaskMetadata } from "./tasksFormat";
import { isMacOsDesktopRuntime, type AppleSyncBridge, type AppleSyncProbeResult } from "./appleSyncBridge";
import type { MemosPlusSettings } from "./settings";
import type { TaskIndex, TaskIndexItem } from "./taskIndex";

export interface AppleSyncResult {
  pushed: number;
  pulled: number;
  imported: number;
  unchanged: number;
  skipped: number;
  deletedLocal: number;
  deletedRemote: number;
}

interface AppleSyncServiceOptions {
  app: App;
  taskIndex: TaskIndex;
  bridge: AppleSyncBridge;
  getSettings: () => MemosPlusSettings;
  persistSettings: () => Promise<void>;
  isAvailable?: () => boolean;
}

export class AppleSyncService {
  private activeSync: Promise<AppleSyncResult> | null = null;

  constructor(private readonly options: AppleSyncServiceOptions) {}

  isAvailable(): boolean {
    return this.options.isAvailable?.() ?? (!Platform.isMobile && isMacOsDesktopRuntime());
  }

  async probe(kind: MemosPlusSettings["appleSyncTarget"] = "reminders"): Promise<AppleSyncProbeResult> {
    if (!this.isAvailable()) {
      throw new Error("Apple sync is available only in Obsidian Desktop on macOS");
    }
    return this.options.bridge.probe(kind);
  }

  async createContainer(kind: MemosPlusSettings["appleSyncTarget"], name: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("Apple sync is available only in Obsidian Desktop on macOS");
    }
    const created = await this.options.bridge.createContainer(kind, name);
    if (!created.writable) {
      throw new Error(`${kind === "calendar" ? "Calendar" : "Reminders list"} is read-only: ${created.name}`);
    }
    return created.name;
  }

  syncNow(): Promise<AppleSyncResult> {
    if (this.activeSync) {
      return this.activeSync;
    }
    this.activeSync = this.performSync().finally(() => {
      this.activeSync = null;
    });
    return this.activeSync;
  }

  private async performSync(): Promise<AppleSyncResult> {
    const settings = this.options.getSettings();
    if (!settings.appleSyncEnabled) {
      throw new Error("Apple sync is disabled");
    }
    if (!this.isAvailable()) {
      throw new Error("Apple sync is available only in Obsidian Desktop on macOS");
    }
    const result: AppleSyncResult = { pushed: 0, pulled: 0, imported: 0, unchanged: 0, skipped: 0, deletedLocal: 0, deletedRemote: 0 };
    const state = normalizeAppleSyncState(settings.appleSyncState);
    try {
      // Task synchronization is deliberately isolated to Apple Reminders.
      // Apple Calendar remains the event source for the schedule workspace.
      const kind = "reminders" as const;
      const container = settings.appleRemindersList;
      // Validate and read the Apple container before writing sync IDs into Markdown.
      const remoteItems = await this.options.bridge.list(kind, container);
      const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
      const remoteByLocalId = new Map(remoteItems.filter((item) => item.localId).map((item) => [item.localId, item]));

      await this.options.taskIndex.rebuild();
      let localTasks = this.options.taskIndex.getItems().filter((task) => shouldSyncTask(task, settings.appleSyncTag));
      localTasks = await this.ensureLocalIds(localTasks, (task) => shouldSyncTask(task, settings.appleSyncTag));

      let allLocalById = localTasksById(this.options.taskIndex.getItems());
      const indexStatus = this.options.taskIndex.getStatus();
      const canPropagateDeletions = indexStatus.cacheState === "normal" && indexStatus.failedFiles.length === 0;
      const deferredDeletionIds = new Set<string>();
      for (const [key, record] of Object.entries(state.records)) {
        if (record.kind !== "reminders") continue;
        const local = allLocalById.get(record.localId);
        const remote = remoteById.get(record.remoteId) ?? remoteByLocalId.get(record.localId);
        if ((!local || !remote) && !canPropagateDeletions) {
          deferredDeletionIds.add(record.localId);
          result.skipped += 1;
          continue;
        }
        if (!local && remote) {
          await this.options.bridge.remove(kind, container, remote.id);
          remoteById.delete(remote.id);
          if (remote.localId) remoteByLocalId.delete(remote.localId);
          delete state.records[key];
          result.deletedRemote += 1;
          continue;
        }
        if (local && !remote && shouldSyncTask(local, settings.appleSyncTag)) {
          if (await this.deleteLocalTask(local)) {
            delete state.records[key];
            result.deletedLocal += 1;
          } else {
            result.skipped += 1;
          }
          continue;
        }
        if (!local && !remote) delete state.records[key];
        // Removing the sync tag is an opt-out, not a deletion. Keep the link
        // dormant so neither side is destroyed or re-imported.
      }

      if (result.deletedLocal > 0) await this.options.taskIndex.rebuild();
      localTasks = this.options.taskIndex.getItems().filter((task) => shouldSyncTask(task, settings.appleSyncTag));
      allLocalById = localTasksById(this.options.taskIndex.getItems());

      for (const task of localTasks) {
        const localId = extractAppleSyncId(task.line);
        if (!localId) {
          result.skipped += 1;
          continue;
        }
        if (deferredDeletionIds.has(localId)) continue;
        const key = appleSyncRecordKey(kind, localId);
        const record = state.records[key];
        const remote = remoteByLocalId.get(localId) ?? (record ? remoteById.get(record.remoteId) : undefined);
        const localSignature = localAppleSyncSignature(task, settings.appleSyncTag, kind);
        if (!remote) {
          const created = await this.pushTask(task, localId, undefined);
          state.records[key] = syncedRecord(localId, created, localSignature);
          result.pushed += 1;
          continue;
        }
        const remoteSignature = remoteAppleSyncSignature(remote);
        const direction = resolveAppleSyncDirection(
          localSignature,
          remoteSignature,
          record,
          settings.appleSyncConflictPolicy,
          task.mtime,
          remote.modifiedAt
        );
        if (direction === "push") {
          const updated = await this.pushTask(task, localId, remote.id);
          state.records[key] = syncedRecord(localId, updated, localSignature);
          result.pushed += 1;
        } else if (direction === "pull") {
          const updated = await this.pullTask(task, remote, localId);
          if (updated) {
            state.records[key] = syncedRecord(localId, remote, remoteSignature);
            result.pulled += 1;
          } else {
            result.skipped += 1;
          }
        } else {
          state.records[key] = syncedRecord(localId, remote, localSignature);
          result.unchanged += 1;
        }
      }

      for (const remote of remoteItems) {
        if (!remoteById.has(remote.id)) continue;
        const knownLocalId = remote.localId;
        const knownRecord = knownLocalId ? state.records[appleSyncRecordKey(kind, knownLocalId)] : undefined;
        if ((knownLocalId && allLocalById.has(knownLocalId)) || knownRecord) continue;
        const localId = knownLocalId || createLocalId();
        const imported = await this.importRemoteTask(remote, localId);
        if (!imported) {
          result.skipped += 1;
          continue;
        }
        const linkedRemote = await this.options.bridge.upsert({
          kind,
          container,
          remoteId: remote.id,
          localId,
          title: remote.title,
          completed: remote.completed,
          dueDate: remote.dueDate,
          dueTime: remote.dueTime,
          reminderDate: remote.reminderDate,
          reminderTime: remote.reminderTime,
          reminderMinutesBefore: remote.reminderMinutesBefore,
          allDay: remote.allDay,
          priority: remote.priority
        });
        const signature = remoteAppleSyncSignature(linkedRemote);
        state.records[appleSyncRecordKey(kind, localId)] = syncedRecord(localId, linkedRemote, signature);
        result.imported += 1;
      }

      await this.syncCalendarTasks(state, result);

      state.lastSyncAt = new Date().toISOString();
      state.lastError = "";
      settings.appleSyncState = state;
      await this.options.persistSettings();
      await this.options.taskIndex.rebuild();
      return result;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      settings.appleSyncState = state;
      await this.options.persistSettings().catch(() => undefined);
      throw error;
    }
  }

  private async ensureLocalIds(tasks: TaskIndexItem[], predicate: (task: TaskIndexItem) => boolean): Promise<TaskIndexItem[]> {
    const seen = new Set<string>();
    const changes = new Map<string, Array<{ lineNumber: number; line: string; replacement: string }>>();
    for (const task of tasks) {
      let localId = extractAppleSyncId(task.line);
      if (!localId || seen.has(localId)) {
        localId = createLocalId();
      }
      seen.add(localId);
      const replacement = attachAppleSyncId(task.line, localId);
      if (replacement === task.line) {
        continue;
      }
      const fileChanges = changes.get(task.filePath) ?? [];
      fileChanges.push({ lineNumber: task.lineNumber, line: task.line, replacement });
      changes.set(task.filePath, fileChanges);
    }
    for (const [path, fileChanges] of changes) {
      const file = this.options.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        continue;
      }
      await this.options.app.vault.process(file, (source) => {
        const lines = source.split(/\r?\n/);
        for (const change of fileChanges) {
          const index = change.lineNumber - 1;
          if (lines[index] === change.line) {
            lines[index] = change.replacement;
          }
        }
        return lines.join(source.includes("\r\n") ? "\r\n" : "\n");
      });
      await this.options.taskIndex.updateFile(file);
    }
    return this.options.taskIndex.getItems().filter(predicate);
  }

  private async pushTask(task: TaskIndexItem, localId: string, remoteId: string | undefined): Promise<AppleSyncRemoteItem> {
    const settings = this.options.getSettings();
    const kind = "reminders" as const;
    const reminder = taskReminderForApple(task);
    return this.options.bridge.upsert({
      kind,
      container: settings.appleRemindersList,
      remoteId,
      localId,
      title: appleTitleForKind(taskTitleForApple(task, settings.appleSyncTag), task.completed, kind),
      completed: task.completed,
      dueDate: task.dueDate || task.scheduledDate || "",
      dueTime: taskTimeForApple(task),
      reminderDate: reminder.reminderDate,
      reminderTime: reminder.reminderTime,
      reminderMinutesBefore: reminder.reminderMinutesBefore,
      allDay: reminder.allDay,
      priority: taskPriorityToApple(task.priority)
    });
  }

  private async syncCalendarTasks(state: ReturnType<typeof normalizeAppleSyncState>, result: AppleSyncResult): Promise<void> {
    const settings = this.options.getSettings();
    let tasks = this.options.taskIndex.getItems().filter(shouldSyncCalendarTask);
    tasks = await this.ensureLocalIds(tasks, shouldSyncCalendarTask);
    for (const task of tasks) {
      const localId = extractAppleSyncId(task.line);
      const metadata = parseMemosPlusTaskMetadata(task.line);
      const startDate = task.startDate || task.scheduledDate || task.dueDate;
      if (!localId || !metadata || !startDate) {
        result.skipped += 1;
        continue;
      }
      const key = appleSyncRecordKey("calendar", localId);
      const record = state.records[key];
      const localSignature = localAppleSyncSignature(task, settings.appleSyncTag, "calendar");
      if (record?.localSignature === localSignature) {
        result.unchanged += 1;
        continue;
      }
      const remote = await this.options.bridge.upsert({
        kind: "calendar",
        container: settings.appleCalendarName,
        remoteId: record?.remoteId,
        localId,
        title: appleTitleForKind(taskTitleForApple(task, settings.appleSyncTag), task.completed, "calendar"),
        completed: task.completed,
        dueDate: startDate,
        dueTime: metadata.startTime ?? "",
        endDate: metadata.endDate || startDate,
        endTime: metadata.endTime ?? "",
        reminderMinutesBefore: metadata.reminderMinutesBefore,
        allDay: metadata.allDay === true,
        recurrence: metadata.recurrence,
        priority: 0
      });
      state.records[key] = syncedRecord(localId, remote, localSignature);
      result.pushed += 1;
    }
  }

  private async pullTask(task: TaskIndexItem, remote: AppleSyncRemoteItem, localId: string): Promise<boolean> {
    const file = this.options.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      return false;
    }
    let updated = false;
    await this.options.app.vault.process(file, (source) => {
      const lines = source.split(/\r?\n/);
      const index = task.lineNumber - 1;
      if (lines[index] !== task.line) {
        return source;
      }
      lines[index] = updateTaskLineFromApple(task.line, remote, this.options.getSettings().appleSyncTag, localId);
      updated = lines[index] !== task.line;
      return lines.join(source.includes("\r\n") ? "\r\n" : "\n");
    });
    if (updated) {
      await this.options.taskIndex.updateFile(file);
    }
    return updated;
  }

  private async importRemoteTask(remote: AppleSyncRemoteItem, localId: string): Promise<boolean> {
    const settings = this.options.getSettings();
    const path = normalizeInboxPath(settings.appleSyncInboxPath);
    await ensureParentFolders(this.options.app, path);
    const line = formatImportedAppleTask(remote, settings.appleSyncTag, localId);
    const existing = this.options.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const source = await this.options.app.vault.cachedRead(existing);
      await this.options.app.vault.append(existing, `${source.endsWith("\n") || !source ? "" : "\n"}${line}\n`);
      await this.options.taskIndex.updateFile(existing);
      return true;
    }
    if (existing) {
      return false;
    }
    const created = await this.options.app.vault.create(path, `# Apple 同步\n\n${line}\n`);
    await this.options.taskIndex.updateFile(created);
    return true;
  }

  private async deleteLocalTask(task: TaskIndexItem): Promise<boolean> {
    const file = this.options.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return false;
    let deleted = false;
    await this.options.app.vault.process(file, (source) => {
      const newline = source.includes("\r\n") ? "\r\n" : "\n";
      const lines = source.split(/\r?\n/);
      const index = task.lineNumber - 1;
      if (lines[index] !== task.line) return source;
      lines.splice(index, 1);
      deleted = true;
      return lines.join(newline);
    });
    if (deleted) await this.options.taskIndex.updateFile(file);
    return deleted;
  }
}

function localTasksById(tasks: TaskIndexItem[]): Map<string, TaskIndexItem> {
  const result = new Map<string, TaskIndexItem>();
  for (const task of tasks) {
    const localId = extractAppleSyncId(task.line);
    if (localId && !result.has(localId)) result.set(localId, task);
  }
  return result;
}

function syncedRecord(localId: string, remote: AppleSyncRemoteItem, localSignature: string): AppleSyncRecord {
  return {
    localId,
    kind: remote.kind,
    remoteId: remote.id,
    localSignature,
    remoteSignature: remoteAppleSyncSignature(remote),
    lastSyncedAt: new Date().toISOString()
  };
}

function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeInboxPath(value: string): string {
  const normalized = normalizePath(value.trim().replace(/^\/+/, ""));
  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized || "Apple 同步"}.md`;
}

async function ensureParentFolders(app: App, filePath: string): Promise<void> {
  const parts = filePath.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}
