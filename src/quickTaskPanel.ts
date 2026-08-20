import { Platform, setIcon } from "obsidian";
import type MemosPlusPlugin from "../main";
import { t, type Language } from "./i18n";
import {
  taskDate,
  todayTaskCalendarDate,
  type TaskCalendarQuickPanelTab
} from "./taskCalendar";
import type { TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";
import { quickTaskPanelItems, quickTaskTime } from "./quickTaskPanelModel";
import { taskCompletionDate, taskCompletionTime } from "./taskCompletion";

const INITIAL_VISIBLE_TASKS = 40;

export class QuickTaskPanel {
  private panelEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private unsubscribeTaskIndex: (() => void) | null = null;
  private visibleCount = INITIAL_VISIBLE_TASKS;

  constructor(
    private readonly plugin: MemosPlusPlugin,
    private readonly anchorEl: HTMLElement
  ) {}

  isOpen(): boolean {
    return this.panelEl !== null;
  }

  toggle(): void {
    if (this.panelEl) this.close();
    else this.open();
  }

  open(): void {
    if (this.panelEl) return;
    const doc = this.anchorEl.ownerDocument;
    const lang = this.plugin.settings.language;
    const panel = doc.body.createEl("section", {
      cls: `memos-plus-quick-task-panel${Platform.isMobile ? " is-mobile" : " is-desktop"}`,
      attr: {
        role: "dialog",
        "aria-modal": "false",
        "aria-label": t(lang, "quickTaskPanel.title")
      }
    });
    this.panelEl = panel;
    this.anchorEl.setAttr("aria-expanded", "true");

    if (Platform.isMobile) panel.createDiv({ cls: "memos-plus-quick-task-panel-handle", attr: { "aria-hidden": "true" } });
    const header = panel.createDiv({ cls: "memos-plus-quick-task-panel-header" });
    header.createEl("h3", { text: t(lang, "quickTaskPanel.title") });
    const headerActions = header.createDiv({ cls: "memos-plus-quick-task-panel-header-actions" });
    const full = headerActions.createEl("button", {
      cls: "memos-plus-quick-task-panel-full",
      attr: { type: "button", title: t(lang, "quickTaskPanel.openFull") }
    });
    setIcon(full, "external-link");
    full.createSpan({ text: t(lang, "quickTaskPanel.openFull") });
    full.addEventListener("click", () => {
      this.close();
      void this.plugin.openTaskCalendar({ navigation: "all" });
    });
    headerActions.appendChild(iconButton(doc, "x", t(lang, "quickTaskPanel.close"), () => this.close()));

    const composer = panel.createDiv({ cls: "memos-plus-quick-task-panel-composer" });
    const input = composer.createEl("input", {
      cls: "memos-plus-quick-task-panel-input",
      attr: {
        type: "text",
        placeholder: t(lang, "quickTaskPanel.addPlaceholder"),
        "aria-label": t(lang, "quickTaskPanel.addPlaceholder")
      }
    });
    this.inputEl = input;
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      const fallbackDueDate = this.plugin.settings.taskCalendar.quickPanelTab === "today" ? todayTaskCalendarDate() : "";
      void this.plugin.openUnifiedTaskComposer({ content: text, fallbackDueDate }).then((created) => {
        if (created && this.inputEl) this.inputEl.value = "";
      }).finally(() => {
        if (input.isConnected) {
          input.disabled = false;
          input.focus();
        }
      });
    });

    this.renderTabs(panel);
    this.listEl = panel.createDiv({ cls: "memos-plus-quick-task-panel-results" });
    this.renderTasks();
    this.positionPanel();

    doc.addEventListener("pointerdown", this.handleOutsidePointerDown, true);
    doc.addEventListener("keydown", this.handleDocumentKeyDown, true);
    doc.defaultView?.addEventListener("resize", this.handleWindowResize);
    this.unsubscribeTaskIndex = this.plugin.taskIndex.onChange(() => this.renderTasks());
    if (this.plugin.taskIndex.getStatus().cacheState !== "normal") this.plugin.taskIndex.scheduleBuild(0);
    doc.defaultView?.setTimeout(() => input.focus(), 0);
  }

  close(): void {
    if (!this.panelEl) return;
    const doc = this.anchorEl.ownerDocument;
    doc.removeEventListener("pointerdown", this.handleOutsidePointerDown, true);
    doc.removeEventListener("keydown", this.handleDocumentKeyDown, true);
    doc.defaultView?.removeEventListener("resize", this.handleWindowResize);
    this.unsubscribeTaskIndex?.();
    this.unsubscribeTaskIndex = null;
    this.panelEl.remove();
    this.panelEl = null;
    this.listEl = null;
    this.inputEl = null;
    this.anchorEl.setAttr("aria-expanded", "false");
  }

  destroy(): void {
    this.close();
  }

  private renderTabs(panel: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const tabList = panel.createDiv({ cls: "memos-plus-quick-task-panel-tabs", attr: { role: "tablist" } });
    const tabs: Array<[TaskCalendarQuickPanelTab, Parameters<typeof t>[1]]> = [
      ["today", "quickTaskPanel.tab.today"],
      ["next-seven", "quickTaskPanel.tab.nextSeven"],
      ["important", "quickTaskPanel.tab.important"],
      ["overdue", "quickTaskPanel.tab.overdue"]
    ];
    for (const [value, label] of tabs) {
      const button = tabList.createEl("button", {
        cls: value === this.plugin.settings.taskCalendar.quickPanelTab ? "is-active" : "",
        text: t(lang, label),
        attr: {
          type: "button",
          role: "tab",
          "aria-selected": String(value === this.plugin.settings.taskCalendar.quickPanelTab)
        }
      });
      button.addEventListener("click", () => {
        if (value === this.plugin.settings.taskCalendar.quickPanelTab) return;
        this.plugin.settings.taskCalendar.quickPanelTab = value;
        this.visibleCount = INITIAL_VISIBLE_TASKS;
        for (const candidate of Array.from(tabList.children)) {
          const active = candidate === button;
          candidate.toggleClass("is-active", active);
          candidate.setAttr("aria-selected", String(active));
        }
        this.renderTasks();
        void this.plugin.persistSettings();
      });
    }
  }

  private renderTasks(): void {
    const container = this.listEl;
    if (!container) return;
    container.empty();
    const lang = this.plugin.settings.language;
    const items = quickTaskPanelItems(
      this.plugin.taskIndex.getItems(),
      this.plugin.settings.taskCalendar.quickPanelTab
    );
    const status = this.plugin.taskIndex.getStatus();
    const summary = container.createDiv({ cls: "memos-plus-quick-task-panel-summary" });
    summary.createSpan({ text: t(lang, "taskCalendar.taskCount").replace("{count}", String(items.length)) });
    if (status.updating) summary.createSpan({ cls: "is-loading", text: t(lang, "quickTaskPanel.loading") });
    if (items.length === 0) {
      container.createDiv({ cls: "memos-plus-quick-task-panel-empty", text: status.updating ? t(lang, "quickTaskPanel.loading") : t(lang, "taskCalendar.emptyTasks") });
      return;
    }
    const tab = this.plugin.settings.taskCalendar.quickPanelTab;
    let lastGroup = "";
    for (const task of items.slice(0, this.visibleCount)) {
      const group = tab === "next-seven" ? taskDate(task) : "";
      if (group && group !== lastGroup) {
        container.createDiv({ cls: "memos-plus-quick-task-panel-group", text: formatGroupDate(group, lang) });
        lastGroup = group;
      }
      this.renderTask(container, task);
    }
    if (items.length > this.visibleCount) {
      const more = container.createEl("button", {
        cls: "memos-plus-quick-task-panel-more",
        type: "button",
        text: t(lang, "taskCalendar.loadMore").replace("{count}", String(items.length - this.visibleCount))
      });
      more.addEventListener("click", () => {
        this.visibleCount += INITIAL_VISIBLE_TASKS;
        this.renderTasks();
      });
    }
  }

  private renderTask(container: HTMLElement, task: TaskIndexItem): void {
    const lang = this.plugin.settings.language;
    const title = task.title || t(lang, "taskCalendar.untitledTask");
    const row = container.createDiv({ cls: `memos-plus-quick-task-panel-task${task.completed ? " is-completed" : ""}` });
    const checkbox = row.createEl("input", {
      cls: "memos-plus-quick-task-panel-checkbox",
      type: "checkbox",
      attr: { "aria-label": title }
    });
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => {
      const requested = checkbox.checked;
      checkbox.disabled = true;
      row.toggleClass("is-completed", requested);
      void this.plugin.toggleTaskCalendarTask(task).then((saved) => {
        if (!saved) {
          checkbox.checked = !requested;
          row.toggleClass("is-completed", !requested);
        }
      }).finally(() => {
        if (checkbox.isConnected) checkbox.disabled = false;
      });
    });
    const body = row.createEl("button", {
      cls: "memos-plus-quick-task-panel-task-body",
      attr: { type: "button", title: `${t(lang, "taskCalendar.openSource")}: ${title}` }
    });
    body.createDiv({ cls: "memos-plus-quick-task-panel-task-title", text: title });
    const meta = body.createDiv({ cls: "memos-plus-quick-task-panel-task-meta" });
    if (task.completed) {
      const completedDate = taskCompletionDate(task.completedAt);
      const completedTime = taskCompletionTime(task.completedAt);
      if (completedDate && completedTime) {
        const day = completedDate === todayTaskCalendarDate() ? t(lang, "quickTaskPanel.today") : completedDate;
        meta.createSpan({ text: lang === "zh" ? `${day} ${completedTime} 完成` : `Completed ${day} ${completedTime}` });
      } else if (task.doneDate) {
        meta.createSpan({ text: task.doneDate });
      }
    } else {
      const date = taskDate(task);
      const time = quickTaskTime(task);
      if (date) meta.createSpan({ text: date === todayTaskCalendarDate() ? t(lang, "quickTaskPanel.today") : date });
      if (time) meta.createSpan({ text: time });
    }
    if (task.priority !== "none") meta.createSpan({ cls: task.priority === "highest" || task.priority === "high" ? "is-priority" : "", text: priorityText(task.priority, lang) });
    const apple = this.plugin.taskCalendarAppleStatus(task);
    if (apple) meta.createSpan({
      cls: apple.error ? "is-error" : "is-apple",
      text: apple.error ? `⚠ ${t(lang, "taskCalendar.appleFailed")}` : apple.label.startsWith("↻") ? "↻" : "",
      attr: { title: apple.title }
    });
    body.addEventListener("click", () => {
      this.close();
      void this.plugin.openTaskCalendarTask(task);
    });
    row.appendChild(iconButton(row.ownerDocument, "settings-2", t(lang, "taskCalendar.taskSettings"), () => {
      this.close();
      void this.plugin.openTaskCalendarTaskEditor(task);
    }, "memos-plus-quick-task-panel-task-settings"));
  }

  private positionPanel(): void {
    const panel = this.panelEl;
    if (!panel || Platform.isMobile) return;
    const view = this.anchorEl.ownerDocument.defaultView;
    if (!view) return;
    const anchor = this.anchorEl.getBoundingClientRect();
    panel.style.right = `${Math.max(8, view.innerWidth - anchor.right)}px`;
    panel.style.bottom = `${Math.max(8, view.innerHeight - anchor.top + 8)}px`;
  }

  private readonly handleOutsidePointerDown = (event: PointerEvent): void => {
    const target = event.target as Node | null;
    if (!target || this.panelEl?.contains(target) || this.anchorEl.contains(target)) return;
    this.close();
  };

  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.close();
    this.anchorEl.focus();
  };

  private readonly handleWindowResize = (): void => this.positionPanel();
}

function iconButton(doc: Document, icon: string, label: string, onClick: () => void, className = ""): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `memos-plus-icon-button ${className}`.trim();
  button.setAttribute("title", label);
  button.setAttribute("aria-label", label);
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}

function priorityText(priority: TaskPriorityFilterValue, lang: Language): string {
  const icon = ({ highest: "🔺", high: "⏫", medium: "🔼", low: "🔽", lowest: "⏬", none: "" } as const)[priority];
  const label = t(lang, `taskPriority.${priority}` as Parameters<typeof t>[1]);
  return [icon, label].filter(Boolean).join(" ");
}

function formatGroupDate(date: string, lang: Language): string {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${date}T12:00:00`));
}
