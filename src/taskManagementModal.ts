import { App, Modal, Notice, Platform, setIcon } from "obsidian";
import { todayString } from "./filter";
import { t, type Language } from "./i18n";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";
import { filterTaskManagementItems, taskManagementCounts, type TaskManagementFilter } from "./taskManagement";
import { type TaskIndex, type TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";

interface TaskManagementModalOptions {
  language: Language;
  taskIndex: TaskIndex;
  canEditWithTasksApi: boolean;
  onOpenTask: (item: TaskIndexItem) => Promise<void>;
  onToggleTask: (item: TaskIndexItem) => Promise<boolean>;
  onEditTask: (item: TaskIndexItem) => Promise<boolean>;
}

const FILTERS: ReadonlyArray<{ id: TaskManagementFilter; labelKey: Parameters<typeof t>[1] }> = [
  { id: "open", labelKey: "taskManager.filter.open" },
  { id: "overdue", labelKey: "taskManager.filter.overdue" },
  { id: "today", labelKey: "taskManager.filter.today" },
  { id: "week", labelKey: "taskManager.filter.week" },
  { id: "completed", labelKey: "taskManager.filter.completed" }
];

export class TaskManagementModal extends Modal {
  private activeFilter: TaskManagementFilter = "open";
  private priority: TaskPriorityFilterValue | "all" = "all";
  private query = "";
  private visibleCount = Platform.isMobile ? 30 : 60;
  private resultsEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private refreshButton: HTMLButtonElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private renderTimer: number | null = null;
  private readonly pendingTasks = new Set<string>();

  constructor(app: App, private readonly options: TaskManagementModalOptions) {
    super(app);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "TaskManagementModal");
    this.modalEl.addClass("memos-plus-task-manager-modal-shell");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-task-manager-modal");

    const header = contentEl.createDiv({ cls: "memos-plus-task-manager-header" });
    const heading = header.createDiv();
    heading.createEl("h2", { text: t(this.options.language, "taskManager.title") });
    this.statusEl = heading.createDiv({ cls: "memos-plus-task-manager-status" });
    this.refreshButton = header.createEl("button", {
      cls: "memos-plus-icon-button memos-plus-task-manager-refresh",
      attr: {
        type: "button",
        title: t(this.options.language, "taskManager.refresh"),
        "aria-label": t(this.options.language, "taskManager.refresh")
      }
    });
    setIcon(this.refreshButton, "refresh-cw");
    this.refreshButton.addEventListener("click", () => {
      void withMobileClickLock(this.refreshButton, async () => {
        await this.options.taskIndex.rebuild({ force: true });
      });
    });

    const controls = contentEl.createDiv({ cls: "memos-plus-task-manager-controls" });
    const search = controls.createEl("input", {
      cls: "memos-plus-task-manager-search",
      attr: {
        type: "search",
        placeholder: t(this.options.language, "taskManager.searchPlaceholder"),
        "aria-label": t(this.options.language, "taskManager.searchPlaceholder")
      }
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim().toLowerCase();
      this.visibleCount = Platform.isMobile ? 30 : 60;
      this.scheduleResultsRender();
    });

    const priority = controls.createEl("select", {
      cls: "memos-plus-task-manager-priority",
      attr: { "aria-label": t(this.options.language, "taskManager.priority") }
    });
    const priorityOptions: Array<[TaskPriorityFilterValue | "all", Parameters<typeof t>[1]]> = [
      ["all", "taskManager.priority.all"],
      ["highest", "taskPriority.highest"],
      ["high", "taskPriority.high"],
      ["medium", "taskPriority.medium"],
      ["low", "taskPriority.low"],
      ["lowest", "taskPriority.lowest"],
      ["none", "taskPriority.none"]
    ];
    for (const [value, labelKey] of priorityOptions) {
      priority.createEl("option", { value, text: t(this.options.language, labelKey) });
    }
    priority.addEventListener("change", () => {
      this.priority = priority.value as TaskPriorityFilterValue | "all";
      this.visibleCount = Platform.isMobile ? 30 : 60;
      this.renderResults();
    });

    const filters = contentEl.createDiv({ cls: "memos-plus-task-manager-filters", attr: { role: "tablist" } });
    for (const filter of FILTERS) {
      const button = filters.createEl("button", {
        cls: `memos-plus-task-manager-filter${filter.id === this.activeFilter ? " is-active" : ""}`,
        attr: { type: "button", role: "tab", "data-filter": filter.id, "aria-selected": String(filter.id === this.activeFilter) }
      });
      button.addEventListener("click", () => {
        this.activeFilter = filter.id;
        this.visibleCount = Platform.isMobile ? 30 : 60;
        filters.querySelectorAll<HTMLElement>(".memos-plus-task-manager-filter").forEach((item) => {
          const active = item.dataset.filter === filter.id;
          item.toggleClass("is-active", active);
          item.setAttr("aria-selected", String(active));
        });
        this.renderResults();
      });
    }

    this.resultsEl = contentEl.createDiv({ cls: "memos-plus-task-manager-results" });
    this.unsubscribe = this.options.taskIndex.onChange(() => this.scheduleResultsRender());
    const status = this.options.taskIndex.getStatus();
    if (status.cacheState === "needs-update" && !status.updating) {
      this.options.taskIndex.scheduleBuild(0);
    }
    this.renderResults();
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "TaskManagementModal");
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.pendingTasks.clear();
    this.resultsEl = null;
    this.statusEl = null;
    this.refreshButton = null;
    this.modalEl.removeClass("memos-plus-task-manager-modal-shell");
    this.contentEl.empty();
  }

  private scheduleResultsRender(): void {
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
    }
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      this.renderResults();
    }, Platform.isMobile ? 120 : 60);
  }

  private renderResults(): void {
    const results = this.resultsEl;
    if (!results) {
      return;
    }
    const lang = this.options.language;
    const status = this.options.taskIndex.getStatus();
    const allItems = this.options.taskIndex.getItems();
    const counts = taskManagementCounts(allItems, todayString());
    this.statusEl?.setText(
      status.updating || !status.updatedAt
        ? t(lang, "taskIndex.updating")
        : t(lang, "taskManager.summary").replace("{open}", String(counts.open)).replace("{completed}", String(counts.completed))
    );
    this.refreshButton?.toggleClass("is-loading", status.updating);
    if (this.refreshButton) {
      this.refreshButton.disabled = status.updating;
    }
    this.contentEl.querySelectorAll<HTMLElement>(".memos-plus-task-manager-filter").forEach((button) => {
      const filter = button.dataset.filter as TaskManagementFilter | undefined;
      const config = FILTERS.find((item) => item.id === filter);
      if (filter && config) {
        button.setText(`${t(lang, config.labelKey)} ${counts[filter]}`);
      }
    });

    results.empty();
    const filtered = filterTaskManagementItems(allItems, {
      filter: this.activeFilter,
      priority: this.priority,
      query: this.query,
      today: todayString()
    });
    if (filtered.length === 0) {
      results.createDiv({
        cls: "memos-plus-empty memos-plus-task-manager-empty",
        text: status.updating ? t(lang, "taskIndex.updating") : t(lang, "taskManager.empty")
      });
      return;
    }
    for (const item of filtered.slice(0, this.visibleCount)) {
      this.renderTaskRow(results, item);
    }
    if (filtered.length > this.visibleCount) {
      const more = results.createEl("button", {
        cls: "memos-plus-load-more",
        attr: { type: "button" },
        text: t(lang, "taskManager.loadMore").replace("{count}", String(filtered.length - this.visibleCount))
      });
      more.addEventListener("click", () => {
        this.visibleCount += Platform.isMobile ? 30 : 60;
        this.renderResults();
      });
    }
  }

  private renderTaskRow(container: HTMLElement, item: TaskIndexItem): void {
    const lang = this.options.language;
    const key = `${item.filePath}:${item.lineNumber}:${item.line}`;
    const row = container.createDiv({ cls: "memos-plus-task-manager-row" });
    const checkbox = row.createEl("input", {
      cls: "memos-plus-task-manager-checkbox",
      attr: { type: "checkbox", "aria-label": t(lang, item.completed ? "taskManager.reopen" : "taskManager.complete") }
    });
    checkbox.checked = item.completed;
    checkbox.disabled = this.pendingTasks.has(key);
    checkbox.addEventListener("change", () => {
      checkbox.checked = item.completed;
      if (this.pendingTasks.has(key)) {
        return;
      }
      this.pendingTasks.add(key);
      checkbox.disabled = true;
      void this.options.onToggleTask(item).then((updated) => {
        this.pendingTasks.delete(key);
        if (!updated && checkbox.isConnected) {
          checkbox.disabled = false;
          checkbox.checked = item.completed;
        }
      });
    });

    const open = row.createEl("button", { cls: "memos-plus-task-manager-task", attr: { type: "button" } });
    open.createDiv({ cls: "memos-plus-task-manager-task-title", text: item.text });
    const meta = open.createDiv({ cls: "memos-plus-task-manager-task-meta" });
    meta.createSpan({ text: item.filePath });
    meta.createSpan({ text: t(lang, "taskIndex.lineNumber").replace("{line}", String(item.lineNumber)) });
    const date = item.dueDate || item.scheduledDate || item.startDate;
    if (date) {
      meta.createSpan({ text: date });
    }
    open.addEventListener("click", () => {
      this.close();
      void this.options.onOpenTask(item);
    });

    const actions = row.createDiv({ cls: "memos-plus-task-manager-row-actions" });
    if (this.options.canEditWithTasksApi) {
      const edit = actions.createEl("button", {
        cls: "memos-plus-icon-button",
        attr: { type: "button", title: t(lang, "taskManager.edit"), "aria-label": t(lang, "taskManager.edit") }
      });
      setIcon(edit, "pencil");
      edit.addEventListener("click", () => {
        void withMobileClickLock(edit, async () => {
          await this.options.onEditTask(item);
        });
      });
    }
    const source = actions.createEl("button", {
      cls: "memos-plus-icon-button",
      attr: { type: "button", title: t(lang, "taskManager.openSource"), "aria-label": t(lang, "taskManager.openSource") }
    });
    setIcon(source, "external-link");
    source.addEventListener("click", () => {
      this.close();
      void this.options.onOpenTask(item);
    });
  }
}

export function showTaskMutationFailure(language: Language): void {
  new Notice(t(language, "taskManager.updateFailed"));
}
