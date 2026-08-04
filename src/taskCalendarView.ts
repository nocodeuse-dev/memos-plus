import { ItemView, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import type MemosPlusPlugin from "../main";
import { AppleCalendarAgendaService, type AppleCalendarAgendaEvent } from "./appleCalendarAgenda";
import { t } from "./i18n";
import {
  formatTaskCalendarDate,
  taskCalendarDateRange,
  taskCalendarTasks,
  todayTaskCalendarDate,
  type TaskCalendarNavigation,
  type TaskCalendarSettings,
  type TaskCalendarViewMode
} from "./taskCalendar";
import type { TaskIndexItem } from "./taskIndex";

export const MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE = "memos-plus-task-calendar-view";

const NAVIGATION: ReadonlyArray<{ id: TaskCalendarNavigation; icon: string; labelKey: Parameters<typeof t>[1] }> = [
  { id: "today", icon: "sun", labelKey: "taskCalendar.nav.today" },
  { id: "inbox", icon: "inbox", labelKey: "taskCalendar.nav.inbox" },
  { id: "all", icon: "list-todo", labelKey: "taskCalendar.nav.all" },
  { id: "completed", icon: "check-circle-2", labelKey: "taskCalendar.nav.completed" }
];

export class TaskCalendarView extends ItemView {
  private readonly agenda = new AppleCalendarAgendaService();
  private events: AppleCalendarAgendaEvent[] = [];
  private agendaError = "";
  private agendaLoading = false;
  private loadedAgendaKey = "";
  private unsubscribeTasks: (() => void) | null = null;
  private renderTimer: number | null = null;
  private renderVersion = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: MemosPlusPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t(this.plugin.settings.language, "taskCalendar.title");
  }

  getIcon(): string {
    return "calendar-days";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("memos-plus-task-calendar-view");
    this.unsubscribeTasks = this.plugin.taskIndex.onChange(() => this.scheduleRender());
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribeTasks?.();
    this.unsubscribeTasks = null;
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = null;
    this.renderVersion += 1;
    this.contentEl.empty();
  }

  focusQuickTaskInput(): void {
    this.contentEl.querySelector<HTMLInputElement>(".memos-plus-task-calendar-quick-input")?.focus();
  }

  openToday(): void {
    void this.updateState({ navigation: "today", selectedDate: todayTaskCalendarDate() });
  }

  openInbox(): void {
    void this.updateState({ navigation: "inbox" }).then(() => this.focusQuickTaskInput());
  }

  openDefault(): void {
    void this.updateState({ navigation: this.plugin.settings.taskCalendar.defaultView });
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, Platform.isMobile ? 120 : 50);
  }

  private render(): void {
    if (!this.contentEl.isConnected) return;
    const lang = this.plugin.settings.language;
    const state = this.plugin.settings.taskCalendar;
    const selectedDate = state.selectedDate || todayTaskCalendarDate();
    const items = this.plugin.taskIndex.getItems();
    const tasks = taskCalendarTasks(items, state.navigation, selectedDate);
    const range = taskCalendarDateRange(selectedDate, state.viewMode);
    const root = this.contentEl;
    root.empty();
    root.addClass("memos-plus-task-calendar", Platform.isMobile ? "is-mobile" : "is-desktop");
    root.setAttr("data-mobile-tab", state.mobileTab);
    root.toggleClass("is-sidebar-collapsed", state.sidebarCollapsed);
    root.toggleClass("is-tasks-hidden", !Platform.isMobile && state.tasksPaneHidden);

    const header = root.createDiv({ cls: "memos-plus-task-calendar-header" });
    const titleBlock = header.createDiv({ cls: "memos-plus-task-calendar-title" });
    titleBlock.createEl("h2", { text: t(lang, "taskCalendar.title") });
    titleBlock.createDiv({ cls: "memos-plus-task-calendar-subtitle", text: formatTaskCalendarDate(selectedDate, lang === "zh" ? "zh-CN" : "en-US") });
    const headerActions = header.createDiv({ cls: "memos-plus-task-calendar-header-actions" });
    this.iconButton(headerActions, "chevron-left", t(lang, "taskCalendar.previous"), () => {
      void this.updateState({ selectedDate: shiftDate(selectedDate, state.viewMode, -1) });
    });
    this.iconButton(headerActions, "calendar-days", t(lang, "taskCalendar.today"), () => this.openToday());
    this.iconButton(headerActions, "chevron-right", t(lang, "taskCalendar.next"), () => {
      void this.updateState({ selectedDate: shiftDate(selectedDate, state.viewMode, 1) });
    });
    const mode = headerActions.createEl("button", { cls: "memos-plus-task-calendar-mode", attr: { type: "button" } });
    mode.setText(state.viewMode === "day" ? t(lang, "taskCalendar.mode.day") : t(lang, "taskCalendar.mode.week"));
    mode.addEventListener("click", () => void this.updateState({ viewMode: state.viewMode === "day" ? "week" : "day" }));
    this.iconButton(headerActions, "refresh-cw", t(lang, "taskCalendar.refresh"), () => void this.loadAgenda(range.startDate, range.endDate, true));

    if (Platform.isMobile) {
      const tabs = root.createDiv({ cls: "memos-plus-task-calendar-mobile-tabs", attr: { role: "tablist" } });
      for (const [id, label] of [["today", "taskCalendar.mobile.today"], ["tasks", "taskCalendar.mobile.tasks"], ["calendar", "taskCalendar.mobile.calendar"]] as const) {
        const tab = tabs.createEl("button", { cls: state.mobileTab === id ? "is-active" : "", text: t(lang, label), attr: { type: "button", role: "tab", "aria-selected": String(state.mobileTab === id) } });
        tab.addEventListener("click", () => void this.updateState({ mobileTab: id }));
      }
    }

    const layout = root.createDiv({ cls: "memos-plus-task-calendar-layout" });
    const navigation = layout.createDiv({ cls: "memos-plus-task-calendar-navigation" });
    const collapse = this.iconButton(navigation, state.sidebarCollapsed ? "panel-left-open" : "panel-left-close", t(lang, "taskCalendar.collapse"), () => void this.updateState({ sidebarCollapsed: !state.sidebarCollapsed }));
    collapse.addClass("memos-plus-task-calendar-collapse");
    for (const item of NAVIGATION) {
      const button = navigation.createEl("button", { cls: `memos-plus-task-calendar-nav${state.navigation === item.id ? " is-active" : ""}`, attr: { type: "button", "data-nav": item.id } });
      setIcon(button, item.icon);
      button.createSpan({ text: t(lang, item.labelKey) });
      button.addEventListener("click", () => void this.updateState({ navigation: item.id }));
    }

    const agenda = layout.createDiv({ cls: "memos-plus-task-calendar-agenda" });
    this.renderAgenda(agenda, range.days, selectedDate);

    const taskPane = layout.createDiv({ cls: "memos-plus-task-calendar-tasks" });
    const taskHeader = taskPane.createDiv({ cls: "memos-plus-task-calendar-pane-header" });
    taskHeader.createEl("h3", { text: t(lang, `taskCalendar.nav.${state.navigation}`) });
    const hideTasks = this.iconButton(taskHeader, state.tasksPaneHidden ? "panel-right-open" : "panel-right-close", t(lang, "taskCalendar.toggleTasks"), () => void this.updateState({ tasksPaneHidden: !state.tasksPaneHidden }));
    hideTasks.addClass("memos-plus-task-calendar-tasks-toggle");
    const quick = taskPane.createEl("input", { cls: "memos-plus-task-calendar-quick-input", attr: { type: "text", placeholder: t(lang, "taskCalendar.quickTask"), "aria-label": t(lang, "taskCalendar.quickTask") } });
    quick.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const text = quick.value.trim();
      if (!text) return;
      quick.disabled = true;
      void this.plugin.createTaskCalendarInboxTask(text, state.navigation === "today" ? selectedDate : "").then((created) => {
        if (created) quick.value = "";
      }).finally(() => { if (quick.isConnected) quick.disabled = false; });
    });
    taskPane.createDiv({ cls: "memos-plus-task-calendar-task-summary", text: t(lang, "taskCalendar.taskCount").replace("{count}", String(tasks.length)) });
    const taskList = taskPane.createDiv({ cls: "memos-plus-task-calendar-task-list" });
    if (tasks.length === 0) {
      taskList.createDiv({ cls: "memos-plus-empty", text: t(lang, "taskCalendar.emptyTasks") });
    } else {
      for (const task of tasks.slice(0, Platform.isMobile ? 40 : 80)) this.renderTask(taskList, task, selectedDate);
      if (tasks.length > (Platform.isMobile ? 40 : 80)) taskList.createDiv({ cls: "memos-plus-task-calendar-more", text: t(lang, "taskCalendar.moreTasks").replace("{count}", String(tasks.length - (Platform.isMobile ? 40 : 80))) });
    }
    const agendaKey = this.agendaKey(range.startDate, range.endDate);
    if (this.loadedAgendaKey !== agendaKey && !this.agendaLoading) {
      void this.loadAgenda(range.startDate, range.endDate, false);
    }
  }

  private renderAgenda(container: HTMLElement, days: string[], selectedDate: string): void {
    const lang = this.plugin.settings.language;
    const header = container.createDiv({ cls: "memos-plus-task-calendar-pane-header" });
    header.createEl("h3", { text: this.plugin.settings.taskCalendar.viewMode === "day" ? t(lang, "taskCalendar.todayAgenda") : t(lang, "taskCalendar.weekAgenda") });
    if (this.agendaLoading) header.createSpan({ cls: "memos-plus-task-calendar-sync-status is-loading", text: t(lang, "taskCalendar.loading") });
    else if (this.agendaError) header.createSpan({ cls: "memos-plus-task-calendar-sync-status is-error", text: t(lang, "taskCalendar.unavailable") });
    else header.createSpan({ cls: "memos-plus-task-calendar-sync-status", text: t(lang, "taskCalendar.ready") });
    if (this.agendaError) {
      container.createDiv({ cls: "memos-plus-task-calendar-agenda-message", text: this.agendaError });
      return;
    }
    for (const day of days) {
      const dayEvents = this.events.filter((event) => event.start.slice(0, 10) === day || (event.allDay && event.end.slice(0, 10) === day));
      const daySection = container.createDiv({ cls: "memos-plus-task-calendar-day" });
      daySection.createDiv({ cls: "memos-plus-task-calendar-day-label", text: formatTaskCalendarDate(day, lang === "zh" ? "zh-CN" : "en-US") });
      if (day === todayTaskCalendarDate() && selectedDate === day) daySection.createDiv({ cls: "memos-plus-task-calendar-now", attr: { "aria-hidden": "true" } });
      const allDay = dayEvents.filter((event) => event.allDay);
      if (allDay.length > 0) {
        const allDayList = daySection.createDiv({ cls: "memos-plus-task-calendar-all-day" });
        allDayList.createSpan({ cls: "memos-plus-task-calendar-time", text: t(lang, "taskCalendar.allDay") });
        for (const event of allDay) this.renderEvent(allDayList, event);
      }
      const timed = dayEvents.filter((event) => !event.allDay);
      if (timed.length === 0 && allDay.length === 0) daySection.createDiv({ cls: "memos-plus-task-calendar-empty-day", text: t(lang, "taskCalendar.emptyAgenda") });
      for (const event of timed) this.renderEvent(daySection, event);
    }
  }

  private renderEvent(container: HTMLElement, event: AppleCalendarAgendaEvent): void {
    const eventEl = container.createDiv({ cls: "memos-plus-task-calendar-event", attr: { title: [event.location, event.notes].filter(Boolean).join("\n") } });
    eventEl.style.setProperty("--memos-plus-calendar-color", colorForCalendar(event.calendar));
    if (!event.allDay) eventEl.createSpan({ cls: "memos-plus-task-calendar-time", text: `${timePart(event.start)}–${timePart(event.end)}` });
    const detail = eventEl.createDiv({ cls: "memos-plus-task-calendar-event-detail" });
    detail.createDiv({ cls: "memos-plus-task-calendar-event-title", text: event.title });
    const meta = [event.calendar, event.location, event.recurring ? "↻" : ""].filter(Boolean).join(" · ");
    if (meta) detail.createDiv({ cls: "memos-plus-task-calendar-event-meta", text: meta });
  }

  private renderTask(container: HTMLElement, task: TaskIndexItem, selectedDate: string): void {
    const item = container.createDiv({ cls: `memos-plus-task-calendar-task${task.completed ? " is-completed" : ""}` });
    const checkbox = item.createEl("input", { type: "checkbox", attr: { "aria-label": task.text } });
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => {
      checkbox.disabled = true;
      void this.plugin.toggleTaskCalendarTask(task).finally(() => { if (checkbox.isConnected) checkbox.disabled = false; });
    });
    const body = item.createEl("button", { cls: "memos-plus-task-calendar-task-body", attr: { type: "button" } });
    body.createDiv({ cls: "memos-plus-task-calendar-task-title", text: task.text || t(this.plugin.settings.language, "taskCalendar.untitledTask") });
    const date = task.dueDate || task.scheduledDate || task.startDate;
    body.createDiv({ cls: "memos-plus-task-calendar-task-meta", text: [date && (date < selectedDate ? t(this.plugin.settings.language, "taskCalendar.overdue") : date), priorityLabel(task.priority)].filter(Boolean).join(" · ") });
    body.addEventListener("click", () => void this.plugin.openTaskCalendarTask(task));
  }

  private async loadAgenda(startDate: string, endDate: string, force: boolean): Promise<void> {
    const settings = this.plugin.settings;
    if (!settings.appleSyncEnabled || settings.appleSyncTarget !== "calendar" || !settings.appleCalendarName.trim()) {
      this.events = [];
      this.agendaError = t(settings.language, "taskCalendar.calendarNotConfigured");
      this.agendaLoading = false;
      return;
    }
    if (this.agendaLoading && !force) return;
    const version = ++this.renderVersion;
    const agendaKey = this.agendaKey(startDate, endDate);
    this.agendaLoading = true;
    this.agendaError = "";
    if (force) this.agenda.clearCache();
    try {
      const result = await this.agenda.listEvents({ startDate, endDate, calendarNames: [settings.appleCalendarName], cacheMinutes: settings.taskCalendar.agendaCacheMinutes });
      if (version !== this.renderVersion || !this.contentEl.isConnected) return;
      this.events = result.events;
      this.loadedAgendaKey = agendaKey;
    } catch (error) {
      if (version !== this.renderVersion || !this.contentEl.isConnected) return;
      this.events = [];
      this.agendaError = error instanceof Error ? error.message : String(error);
      this.loadedAgendaKey = agendaKey;
    } finally {
      if (version === this.renderVersion && this.contentEl.isConnected) {
        this.agendaLoading = false;
        this.render();
      }
    }
  }

  private agendaKey(startDate: string, endDate: string): string {
    const settings = this.plugin.settings;
    return `${startDate}:${endDate}:${settings.appleSyncEnabled}:${settings.appleSyncTarget}:${settings.appleCalendarName}`;
  }

  private async updateState(change: Partial<TaskCalendarSettings>): Promise<void> {
    Object.assign(this.plugin.settings.taskCalendar, change);
    await this.plugin.persistSettings();
    this.render();
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "memos-plus-icon-button", attr: { type: "button", title: label, "aria-label": label } });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
    return button;
  }
}

function shiftDate(date: string, mode: TaskCalendarViewMode, offset: number): string {
  const selected = new Date(`${date || todayTaskCalendarDate()}T12:00:00`);
  selected.setDate(selected.getDate() + offset * (mode === "week" ? 7 : 1));
  return [selected.getFullYear(), String(selected.getMonth() + 1).padStart(2, "0"), String(selected.getDate()).padStart(2, "0")].join("-");
}

function timePart(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function colorForCalendar(name: string): string {
  const palette = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee"];
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function priorityLabel(priority: TaskIndexItem["priority"]): string {
  return ({ highest: "🔺", high: "⏫", medium: "🔼", low: "🔽", lowest: "⏬", none: "" } as const)[priority] || "";
}
