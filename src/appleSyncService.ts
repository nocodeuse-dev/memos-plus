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
  type AppleSyncPendingReason,
  type AppleSyncRecord,
  type AppleSyncRemoteItem
} from "./appleSync";
import { canonicalizeMemosPlusTaskMetadata, parseMemosPlusTaskMetadata } from "./tasksFormat";
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
  waiting: number;
}

interface AppleSyncServiceOptions {
  app: App;
  taskIndex: TaskIndex;
  bridge: AppleSyncBridge;
  getSettings: () => MemosPlusSettings;
  persistSettings: () => Promise<void>;
  isAvailable?: () => boolean;
  now?: () => number;
}

export const APPLE_SYNC_MISSING_GRACE_MS = 24 * 60 * 60_000;
export const APPLE_SYNC_MISSING_MIN_RETRIES = 3;

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
    const result: AppleSyncResult = { pushed: 0, pulled: 0, imported: 0, unchanged: 0, skipped: 0, deletedLocal: 0, deletedRemote: 0, waiting: 0 };
    const state = normalizeAppleSyncState(settings.appleSyncState);
    const now = this.options.now?.() ?? Date.now();
    try {
      // Task synchronization is deliberately isolated to Apple Reminders.
      // Apple Calendar remains the event source for the schedule workspace.
      const kind = "reminders" as const;
      const container = settings.appleRemindersList;
      const reminderContainers = uniqueReminderContainers(container, settings.appleReminderImportLists);
      // Validate and read the Apple container before writing sync IDs into Markdown.
      const remoteItems = await this.listRemoteReminders(reminderContainers);
      const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
      const remoteByLocalId = new Map(remoteItems.filter((item) => item.localId).map((item) => [item.localId, item]));
      const claimedRemoteIds = new Set<string>();
      const rememberRemote = (item: AppleSyncRemoteItem, localId = item.localId): void => {
        remoteById.set(item.id, item);
        if (localId) remoteByLocalId.set(localId, item);
        claimedRemoteIds.add(item.id);
      };

      await this.options.taskIndex.refreshChangedFiles();
      let localTasks = this.options.taskIndex.getItems().filter((task) => shouldSyncTask(task, settings.appleSyncTag));
      const existingLocalIds = new Set(localTasks.map((task) => extractAppleSyncId(task.line)).filter(Boolean));
      localTasks = await this.ensureLocalIds(localTasks, (task) => shouldSyncTask(task, settings.appleSyncTag));
      const newlyAssignedLocalIds = new Set(
        localTasks.map((task) => extractAppleSyncId(task.line)).filter((localId) => localId && !existingLocalIds.has(localId))
      );

      let allLocalById = localTasksById(this.options.taskIndex.getItems());
      const indexStatus = this.options.taskIndex.getStatus();
      const canPropagateDeletions = indexStatus.cacheState === "normal" && indexStatus.failedFiles.length === 0;
      const deferredDeletionIds = new Set<string>();
      for (const [key, record] of Object.entries(state.records)) {
        if (record.kind !== "reminders") continue;
        if (record.container && !reminderContainers.includes(record.container)) {
          deferredDeletionIds.add(record.localId);
          result.skipped += 1;
          continue;
        }
        const local = allLocalById.get(record.localId);
        let remote = findRemoteForRecord(record, remoteItems, remoteById, remoteByLocalId, claimedRemoteIds);
        if (local && remote) {
          if (remote.localId !== record.localId) {
            remote = await this.relinkRemote(remote, record.localId, reminderContainer(remote, record.container || container));
          }
          rememberRemote(remote, record.localId);
          delete state.pending[key];
          continue;
        }
        if ((!local || !remote) && !canPropagateDeletions) {
          deferredDeletionIds.add(record.localId);
          result.waiting += 1;
          result.skipped += 1;
          continue;
        }
        const reason: AppleSyncPendingReason = !local && !remote ? "both-missing" : !local ? "local-missing" : "remote-missing";
        const ready = markAppleSyncPending(state, key, record.localId, reason, now);
        deferredDeletionIds.add(record.localId);
        if (remote) claimedRemoteIds.add(remote.id);
        if (!ready) {
          result.waiting += 1;
          result.skipped += 1;
          continue;
        }
        delete state.pending[key];
        if (!local && remote) {
          await this.options.bridge.remove(kind, reminderContainer(remote, record.container || container), remote.id, record.localId);
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
        const localSignature = localAppleSyncSignature(task, settings.appleSyncTag, kind);
        let remote = remoteByLocalId.get(localId) ?? (record ? remoteById.get(record.remoteId) : undefined);
        if (!remote && !record) {
          remote = findRemoteForLocalTask(task, settings.appleSyncTag, remoteItems, claimedRemoteIds);
        }
        if (remote && remote.localId !== localId) {
          remote = await this.relinkRemote(remote, localId, reminderContainer(remote, record?.container || container));
        }
        if (remote) {
          rememberRemote(remote, localId);
          delete state.pending[key];
        }
        if (!remote) {
          if (!newlyAssignedLocalIds.has(localId)) {
            const ready = markAppleSyncPending(state, key, localId, "linked-local-awaiting-remote", now);
            if (!ready) {
              result.waiting += 1;
              result.skipped += 1;
              continue;
            }
          }
          const created = await this.pushTask(task, localId, undefined, container);
          state.records[key] = syncedRecord(localId, created, localSignature);
          delete state.pending[key];
          rememberRemote(created, localId);
          result.pushed += 1;
          continue;
        }
        const remoteSignature = remoteAppleSyncSignature(remote);
        let direction = resolveAppleSyncDirection(
          localSignature,
          remoteSignature,
          record,
          settings.appleSyncConflictPolicy,
          task.mtime,
          remote.modifiedAt
        );
        // Older plugin versions synchronized the completed checkbox but did
        // not read Reminders.completionDate. Backfill the visible Tasks date
        // and, for current versions, the exact Apple completion timestamp even
        // when all other content signatures are otherwise equal.
        if (direction === "none" && remote.completed && remote.completionDate && (
          task.doneDate !== remote.completionDate || (remote.completionAt && task.completedAt !== remote.completionAt)
        )) {
          direction = "pull";
        }
        // A legacy malformed task-meta marker could previously leak into the
        // Reminder title. Force one clean write-back instead of considering a
        // sanitized comparison signature sufficient.
        if (remote.title.trim() !== appleTitleForKind(remote.title, remote.completed, kind)) {
          direction = "push";
        }
        if (direction === "push") {
          const updated = await this.pushTask(task, localId, remote.id, reminderContainer(remote, record?.container || container));
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
        if (claimedRemoteIds.has(remote.id)) continue;
        const knownLocalId = remote.localId;
        const knownRecord = knownLocalId ? state.records[appleSyncRecordKey(kind, knownLocalId)] : undefined;
        if ((knownLocalId && allLocalById.has(knownLocalId)) || knownRecord) continue;
        if (remote.completed && reminderContainer(remote, container) !== container) {
          result.skipped += 1;
          continue;
        }
        const localId = knownLocalId || createLocalId();
        const key = appleSyncRecordKey(kind, localId);
        if (knownLocalId && !markAppleSyncPending(state, key, localId, "linked-remote-awaiting-local", now)) {
          result.waiting += 1;
          result.skipped += 1;
          continue;
        }
        const imported = await this.importRemoteTask(remote, localId);
        if (!imported) {
          result.skipped += 1;
          continue;
        }
        const remoteContainer = reminderContainer(remote, container);
        const linkedRemote = withReminderContainer(await this.options.bridge.upsert({
          kind,
          container: remoteContainer,
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
        }), remoteContainer);
        const signature = remoteAppleSyncSignature(linkedRemote);
        state.records[key] = syncedRecord(localId, linkedRemote, signature);
        delete state.pending[key];
        rememberRemote(linkedRemote, localId);
        result.imported += 1;
      }

      await this.syncCalendarTasks(state, result);

      state.lastSyncAt = new Date(now).toISOString();
      state.lastError = "";
      settings.appleSyncState = state;
      await this.options.persistSettings();
      return result;
    } catch (error) {
      if (isAppleSyncWaitingError(error)) {
        await this.options.taskIndex.ensureBuilt().catch(() => undefined);
        const localIds = new Set(
          this.options.taskIndex.getItems()
            .filter((task) => shouldSyncTask(task, settings.appleSyncTag))
            .map((task) => extractAppleSyncId(task.line))
            .filter(Boolean)
        );
        for (const record of Object.values(state.records)) {
          if (record.kind === "reminders") localIds.add(record.localId);
        }
        for (const localId of localIds) {
          markAppleSyncPending(state, appleSyncRecordKey("reminders", localId), localId, "remote-missing", now);
        }
        result.waiting = Math.max(1, localIds.size);
        result.skipped += result.waiting;
        state.lastError = "";
        settings.appleSyncState = state;
        await this.options.persistSettings().catch(() => undefined);
        return result;
      }
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
      const replacement = attachAppleSyncId(canonicalizeMemosPlusTaskMetadata(task.line), localId);
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

  private async listRemoteReminders(containers: string[]): Promise<AppleSyncRemoteItem[]> {
    if (this.options.bridge.listMany) {
      return (await this.options.bridge.listMany("reminders", containers)).map((item) => ({
        ...item,
        container: reminderContainer(item, containers[0] ?? "")
      }));
    }
    const groups = await Promise.all(containers.map(async (container) => (
      await this.options.bridge.list("reminders", container)
    ).map((item) => ({ ...item, container: reminderContainer(item, container) }))));
    return groups.flat();
  }

  private async pushTask(task: TaskIndexItem, localId: string, remoteId: string | undefined, container: string): Promise<AppleSyncRemoteItem> {
    const settings = this.options.getSettings();
    const kind = "reminders" as const;
    const reminder = taskReminderForApple(task);
    return withReminderContainer(await this.options.bridge.upsert({
      kind,
      container,
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
    }), container);
  }

  private async relinkRemote(remote: AppleSyncRemoteItem, localId: string, container: string): Promise<AppleSyncRemoteItem> {
    return withReminderContainer(await this.options.bridge.upsert({
      kind: "reminders",
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
    }), container);
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

function findRemoteForRecord(
  record: AppleSyncRecord,
  remoteItems: AppleSyncRemoteItem[],
  remoteById: Map<string, AppleSyncRemoteItem>,
  remoteByLocalId: Map<string, AppleSyncRemoteItem>,
  claimedRemoteIds: Set<string>
): AppleSyncRemoteItem | undefined {
  const byLocalId = remoteByLocalId.get(record.localId);
  if (byLocalId) return byLocalId;
  const byRemoteId = remoteById.get(record.remoteId);
  if (byRemoteId && (!byRemoteId.localId || byRemoteId.localId === record.localId)) return byRemoteId;
  const recordContainer = record.container?.trim() ?? "";
  const signatureMatches = remoteItems.filter((item) =>
    !claimedRemoteIds.has(item.id)
    && (!item.localId || item.localId === record.localId)
    && (!recordContainer || reminderContainer(item, recordContainer) === recordContainer)
    && remoteAppleSyncSignature(item) === record.remoteSignature
  );
  return signatureMatches.length === 1 ? signatureMatches[0] : undefined;
}

function isAppleSyncWaitingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /等待 iCloud|timed out|timeout|ETIMEDOUT/i.test(message);
}

function findRemoteForLocalTask(
  task: TaskIndexItem,
  tag: string,
  remoteItems: AppleSyncRemoteItem[],
  claimedRemoteIds: Set<string>
): AppleSyncRemoteItem | undefined {
  const candidates = remoteItems.filter((item) => !claimedRemoteIds.has(item.id) && !item.localId);
  const localSignature = localAppleSyncSignature(task, tag, "reminders");
  const exact = candidates.filter((item) => remoteAppleSyncSignature(item) === localSignature);
  if (exact.length === 1) return exact[0];
  const scored = candidates
    .map((item) => ({ item, score: localRemoteMatchScore(task, tag, item) }))
    .filter((candidate) => candidate.score >= 6)
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0 || (scored[1] && scored[1].score === scored[0].score)) return undefined;
  return scored[0].item;
}

function localRemoteMatchScore(task: TaskIndexItem, tag: string, remote: AppleSyncRemoteItem): number {
  if (taskTitleForApple(task, tag) !== remote.title.trim()) return -1;
  let score = 4;
  if (task.completed === remote.completed) score += 2;
  const localDate = task.dueDate || task.scheduledDate || "";
  if (localDate === remote.dueDate) score += localDate ? 2 : 1;
  const localTime = taskTimeForApple(task);
  if (localTime === remote.dueTime || (!localTime && remote.dueTime === "00:00")) score += localTime ? 2 : 1;
  if (taskPriorityToApple(task.priority) === remote.priority) score += 1;
  return score;
}

function markAppleSyncPending(
  state: ReturnType<typeof normalizeAppleSyncState>,
  key: string,
  localId: string,
  reason: AppleSyncPendingReason,
  now: number
): boolean {
  const previous = state.pending[key];
  const firstSeenAt = previous?.reason === reason && previous.firstSeenAt
    ? previous.firstSeenAt
    : new Date(now).toISOString();
  const retryCount = previous?.reason === reason ? previous.retryCount + 1 : 1;
  state.pending[key] = {
    localId,
    kind: "reminders",
    reason,
    firstSeenAt,
    lastAttemptAt: new Date(now).toISOString(),
    retryCount
  };
  const elapsed = now - Date.parse(firstSeenAt);
  return retryCount >= APPLE_SYNC_MISSING_MIN_RETRIES && Number.isFinite(elapsed) && elapsed >= APPLE_SYNC_MISSING_GRACE_MS;
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
    container: remote.container?.trim() || undefined,
    remoteId: remote.id,
    localSignature,
    remoteSignature: remoteAppleSyncSignature(remote),
    lastSyncedAt: new Date().toISOString()
  };
}

function uniqueReminderContainers(primary: string, imports: string[]): string[] {
  const seen = new Set<string>();
  return [primary, ...imports].flatMap((value) => {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function reminderContainer(item: Pick<AppleSyncRemoteItem, "container">, fallback: string): string {
  return item.container?.trim() || fallback;
}

function withReminderContainer(item: AppleSyncRemoteItem, container: string): AppleSyncRemoteItem {
  return { ...item, container: reminderContainer(item, container) };
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
