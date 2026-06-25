import type { App, TFile } from "obsidian";
import type { OrganizerFilterId, OrganizerTaskBranchId } from "./organizerPanel";
import { isOrganizerTaskBranchId } from "./organizerPanel";
import { parseTaskLines, type ParsedTaskLine, type TaskPriorityFilterValue } from "./taskSearch";

export interface TaskIndexItem {
  filePath: string;
  fileName: string;
  line: string;
  lineNumber: number;
  text: string;
  completed: boolean;
  priority: TaskPriorityFilterValue;
  dueDate: string;
  scheduledDate: string;
  startDate: string;
  createdDate: string;
  doneDate: string;
  recurring: boolean;
  mtime: number;
}

export interface TaskIndexFileContext {
  filePath: string;
  fileName: string;
  mtime: number;
}

export interface TaskIndexStatus {
  indexedTasks: number;
  indexedFiles: number;
  updatedAt: string;
  updating: boolean;
  cacheState: "normal" | "needs-update" | "updating";
  failedFiles: string[];
}

interface TaskIndexFileCache {
  mtime: number;
  tasks: TaskIndexItem[];
}

type TaskIndexListener = () => void;

export class TaskIndex {
  private readonly fileCache = new Map<string, TaskIndexFileCache>();
  private readonly listeners = new Set<TaskIndexListener>();
  private items: TaskIndexItem[] = [];
  private updating = false;
  private needsUpdate = true;
  private updatedAt = "";
  private failedFiles: string[] = [];
  private buildTimer: number | null = null;

  constructor(private readonly app: App, private readonly options: { isMobile?: () => boolean } = {}) {}

  getItems(): TaskIndexItem[] {
    return this.items;
  }

  getStatus(): TaskIndexStatus {
    return {
      indexedTasks: this.items.length,
      indexedFiles: this.fileCache.size,
      updatedAt: this.updatedAt,
      updating: this.updating,
      cacheState: this.updating ? "updating" : this.needsUpdate ? "needs-update" : "normal",
      failedFiles: [...this.failedFiles]
    };
  }

  onChange(listener: TaskIndexListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  invalidate(path?: string): void {
    if (!path) {
      this.fileCache.clear();
      this.items = [];
      this.needsUpdate = true;
      this.emitChange();
      return;
    }
    const normalized = normalizeVaultPath(path);
    this.fileCache.delete(normalized);
    this.items = this.items.filter((item) => item.filePath !== normalized);
    this.needsUpdate = true;
    this.emitChange();
  }

  clearCache(): void {
    if (this.buildTimer !== null) {
      window.clearTimeout(this.buildTimer);
      this.buildTimer = null;
    }
    this.fileCache.clear();
    this.items = [];
    this.updatedAt = "";
    this.failedFiles = [];
    this.needsUpdate = true;
    this.emitChange();
  }

  scheduleBuild(delayMs = 800): void {
    if (this.buildTimer !== null) {
      window.clearTimeout(this.buildTimer);
    }
    this.buildTimer = window.setTimeout(() => {
      this.buildTimer = null;
      void this.rebuild();
    }, delayMs);
  }

  async rebuild(options: { force?: boolean; batchSize?: number } = {}): Promise<void> {
    if (this.updating) {
      return;
    }
    this.updating = true;
    this.needsUpdate = true;
    this.failedFiles = [];
    this.emitChange();
    const force = options.force === true;
    const batchSize = Math.max(1, options.batchSize ?? (this.options.isMobile?.() ? 10 : 40));
    const nextCache = new Map<string, TaskIndexFileCache>();
    const files = this.app.vault.getMarkdownFiles();
    for (let index = 0; index < files.length; index += batchSize) {
      const batch = files.slice(index, index + batchSize);
      for (const file of batch) {
        const path = normalizeVaultPath(file.path);
        const mtime = file.stat?.mtime ?? 0;
        const cached = this.fileCache.get(path);
        if (!force && cached && cached.mtime === mtime) {
          nextCache.set(path, cached);
          continue;
        }
        try {
          const source = await this.app.vault.cachedRead(file);
          nextCache.set(path, {
            mtime,
            tasks: parseTaskIndexItemsFromMarkdown(source, {
              filePath: path,
              fileName: file.basename || file.name.replace(/\.md$/i, ""),
              mtime
            })
          });
        } catch {
          this.failedFiles.push(path);
        }
      }
      await yieldToUi();
    }
    this.fileCache.clear();
    for (const [path, cache] of nextCache) {
      this.fileCache.set(path, cache);
    }
    this.items = Array.from(this.fileCache.values()).flatMap((entry) => entry.tasks);
    this.updatedAt = new Date().toISOString();
    this.updating = false;
    this.needsUpdate = false;
    this.emitChange();
  }

  async updateFile(file: TFile): Promise<void> {
    if (file.extension !== "md") {
      this.invalidate(file.path);
      return;
    }
    const path = normalizeVaultPath(file.path);
    const mtime = file.stat?.mtime ?? 0;
    try {
      const source = await this.app.vault.cachedRead(file);
      this.fileCache.set(path, {
        mtime,
        tasks: parseTaskIndexItemsFromMarkdown(source, {
          filePath: path,
          fileName: file.basename || file.name.replace(/\.md$/i, ""),
          mtime
        })
      });
      this.items = Array.from(this.fileCache.values()).flatMap((entry) => entry.tasks);
      this.updatedAt = new Date().toISOString();
      this.needsUpdate = false;
      this.failedFiles = this.failedFiles.filter((failedPath) => failedPath !== path);
      this.emitChange();
    } catch {
      this.failedFiles = Array.from(new Set([...this.failedFiles, path]));
      this.needsUpdate = true;
      this.emitChange();
    }
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function parseTaskIndexItemsFromMarkdown(source: string, context: TaskIndexFileContext): TaskIndexItem[] {
  const items: TaskIndexItem[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    const task = parseTaskLines(line)[0];
    if (!task) {
      return;
    }
    items.push(taskIndexItemFromParsedTask(task, line, index + 1, context));
  });
  return items;
}

export function filterTaskIndexItems(items: TaskIndexItem[], filterId: OrganizerFilterId, today: string): TaskIndexItem[] {
  if (filterId === "tasks") {
    return sortTaskIndexItems(items.filter((item) => !item.completed));
  }
  if (!isOrganizerTaskBranchId(filterId)) {
    return [];
  }
  return sortTaskIndexItems(items.filter((item) => !item.completed && taskIndexItemMatchesBranch(item, filterId, today)));
}

export function getTaskIndexOrganizerCounts(items: TaskIndexItem[], today: string): Record<"tasks" | OrganizerTaskBranchId, number> {
  return {
    tasks: filterTaskIndexItems(items, "tasks", today).length,
    "task-priority-highest": filterTaskIndexItems(items, "task-priority-highest", today).length,
    "task-priority-high": filterTaskIndexItems(items, "task-priority-high", today).length,
    "task-priority-medium": filterTaskIndexItems(items, "task-priority-medium", today).length,
    "task-priority-low": filterTaskIndexItems(items, "task-priority-low", today).length,
    "task-priority-lowest": filterTaskIndexItems(items, "task-priority-lowest", today).length,
    "task-priority-none": filterTaskIndexItems(items, "task-priority-none", today).length,
    "task-overdue": filterTaskIndexItems(items, "task-overdue", today).length,
    "task-due-today": filterTaskIndexItems(items, "task-due-today", today).length,
    "task-due-this-week": filterTaskIndexItems(items, "task-due-this-week", today).length
  };
}

function taskIndexItemFromParsedTask(task: ParsedTaskLine, line: string, lineNumber: number, context: TaskIndexFileContext): TaskIndexItem {
  return {
    filePath: normalizeVaultPath(context.filePath),
    fileName: context.fileName,
    line,
    lineNumber,
    text: task.text,
    completed: task.completed,
    priority: task.priority,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    startDate: task.startDate,
    createdDate: task.createdDate,
    doneDate: task.doneDate,
    recurring: task.recurring,
    mtime: context.mtime
  };
}

function taskIndexItemMatchesBranch(item: TaskIndexItem, branchId: OrganizerTaskBranchId, today: string): boolean {
  switch (branchId) {
    case "task-priority-highest":
      return item.priority === "highest";
    case "task-priority-high":
      return item.priority === "high";
    case "task-priority-medium":
      return item.priority === "medium";
    case "task-priority-low":
      return item.priority === "low";
    case "task-priority-lowest":
      return item.priority === "lowest";
    case "task-priority-none":
      return item.priority === "none";
    case "task-overdue":
      return Boolean(item.dueDate) && item.dueDate < today;
    case "task-due-today":
      return item.dueDate === today;
    case "task-due-this-week":
      return Boolean(item.dueDate) && item.dueDate >= startOfWeek(today) && item.dueDate <= addDays(startOfWeek(today), 6);
    default:
      return false;
  }
}

function sortTaskIndexItems(items: TaskIndexItem[]): TaskIndexItem[] {
  return [...items].sort((left, right) => right.mtime - left.mtime || left.filePath.localeCompare(right.filePath) || left.lineNumber - right.lineNumber);
}

function startOfWeek(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return formatDate(date);
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDate(date: Date): string {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").trim();
}
