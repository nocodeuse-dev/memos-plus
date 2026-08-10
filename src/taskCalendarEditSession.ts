import type { TaskIndexItem } from "./taskIndex";
import {
  taskCalendarTaskWithPatch,
  type TaskCalendarTaskEditContext,
  type TaskCalendarTaskPatch
} from "./taskCalendarTaskEditor";

export type TaskCalendarSaveState = "saved" | "modified" | "saving" | "save-failed";
export type TaskCalendarSyncState = "idle" | "syncing" | "synced" | "sync-failed";

export interface TaskCalendarEditSnapshot {
  task: TaskIndexItem;
  saveState: TaskCalendarSaveState;
  syncState: TaskCalendarSyncState;
  saveError: string;
  revision: number;
  canRetry: boolean;
}

export interface TaskCalendarEditSessionOptions {
  task: TaskIndexItem;
  context: TaskCalendarTaskEditContext;
  persist: (task: TaskIndexItem, patch: TaskCalendarTaskPatch) => Promise<boolean>;
  shouldSync: (task: TaskIndexItem) => boolean;
  sync: () => Promise<boolean>;
}

export class TaskCalendarEditSession {
  private persistedTask: TaskIndexItem;
  private optimisticTask: TaskIndexItem;
  private pendingPatch: TaskCalendarTaskPatch = {};
  private saveState: TaskCalendarSaveState = "saved";
  private syncState: TaskCalendarSyncState = "idle";
  private saveError = "";
  private revision = 0;
  private saving = false;
  private syncing = false;
  private syncNeedsRerun = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private listener: ((snapshot: TaskCalendarEditSnapshot) => void) | null = null;

  constructor(private readonly options: TaskCalendarEditSessionOptions) {
    this.persistedTask = options.task;
    this.optimisticTask = options.task;
  }

  getSnapshot(): TaskCalendarEditSnapshot {
    return {
      task: this.optimisticTask,
      saveState: this.saveState,
      syncState: this.syncState,
      saveError: this.saveError,
      revision: this.revision,
      canRetry: this.saveState === "save-failed"
    };
  }

  setListener(listener: ((snapshot: TaskCalendarEditSnapshot) => void) | null): void {
    this.listener = listener;
    if (listener) listener(this.getSnapshot());
  }

  apply(patch: TaskCalendarTaskPatch, debounceMs = 0): void {
    this.pendingPatch = mergeTaskPatch(this.pendingPatch, patch);
    this.optimisticTask = taskCalendarTaskWithPatch(this.optimisticTask, patch, this.options.context);
    this.revision += 1;
    this.saveState = "modified";
    this.syncState = "idle";
    this.saveError = "";
    this.notify();
    this.scheduleSave(debounceMs);
  }

  flushNow(): void {
    this.clearSaveTimer();
    void this.flush();
  }

  retry(): void {
    if (this.saveState !== "save-failed") return;
    this.saveState = "modified";
    this.saveError = "";
    this.notify();
    this.flushNow();
  }

  reconcile(task: TaskIndexItem): void {
    this.persistedTask = task;
    if (!this.saving && !hasTaskPatch(this.pendingPatch) && this.saveState !== "save-failed") {
      this.optimisticTask = task;
    }
  }

  dispose(): void {
    this.listener = null;
    this.clearSaveTimer();
    if (this.syncTimer !== null) clearTimeout(this.syncTimer);
    this.syncTimer = null;
  }

  private scheduleSave(delay: number): void {
    this.clearSaveTimer();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, Math.max(0, delay));
  }

  private async flush(): Promise<void> {
    if (this.saving || !hasTaskPatch(this.pendingPatch)) return;
    const patch = this.pendingPatch;
    this.pendingPatch = {};
    const sourceTask = this.persistedTask;
    this.saving = true;
    this.saveState = "saving";
    this.saveError = "";
    this.notify();
    let saved = false;
    try {
      saved = await this.options.persist(sourceTask, patch);
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : String(error);
    }
    this.saving = false;
    if (!saved) {
      this.pendingPatch = mergeTaskPatch(patch, this.pendingPatch);
      this.saveState = "save-failed";
      this.saveError ||= "save-failed";
      this.notify();
      return;
    }

    this.persistedTask = taskCalendarTaskWithPatch(sourceTask, patch, this.options.context);
    this.saveState = hasTaskPatch(this.pendingPatch) ? "modified" : "saved";
    this.saveError = "";
    this.notify();
    if (hasTaskPatch(this.pendingPatch)) {
      void this.flush();
      return;
    }
    this.requestSync();
  }

  private requestSync(): void {
    if (this.saving || hasTaskPatch(this.pendingPatch) || this.saveState === "save-failed") return;
    if (!this.options.shouldSync(this.optimisticTask)) {
      this.syncState = "idle";
      this.notify();
      return;
    }
    if (this.syncing) {
      this.syncNeedsRerun = true;
      this.syncState = "syncing";
      this.notify();
      return;
    }
    this.syncing = true;
    this.syncState = "syncing";
    this.notify();
    const revision = this.revision;
    void this.options.sync().then((synced) => {
      this.syncing = false;
      if (this.syncNeedsRerun || revision !== this.revision || hasTaskPatch(this.pendingPatch) || this.saving) {
        this.syncNeedsRerun = false;
        if (this.syncTimer !== null) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => {
          this.syncTimer = null;
          this.requestSync();
        }, 0);
        return;
      }
      this.syncState = synced ? "synced" : "sync-failed";
      this.notify();
    }).catch(() => {
      this.syncing = false;
      this.syncState = "sync-failed";
      this.notify();
    });
  }

  private notify(): void {
    this.listener?.(this.getSnapshot());
  }

  private clearSaveTimer(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }
}

function mergeTaskPatch(older: TaskCalendarTaskPatch, newer: TaskCalendarTaskPatch): TaskCalendarTaskPatch {
  return { ...older, ...newer };
}

function hasTaskPatch(patch: TaskCalendarTaskPatch): boolean {
  return Object.keys(patch).length > 0;
}
