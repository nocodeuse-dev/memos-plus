import { ItemView, Notice, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import type MemosPlusPlugin from "../main";
import { AppleCalendarAgendaService, type AppleCalendarAgendaEvent } from "./appleCalendarAgenda";
import { t } from "./i18n";
import {
  formatTaskCalendarMonth,
  formatTaskCalendarDate,
  shiftTaskCalendarMonth,
  taskCalendarMonthDays,
  taskCalendarDefaultAgendaNames,
  taskCalendarDateRange,
  taskCalendarTasks,
  todayTaskCalendarDate,
  type TaskCalendarNavigation,
  type TaskCalendarOpenOptions,
  type TaskCalendarProjectFilter,
  type TaskCalendarSettings,
  type TaskCalendarViewMode
} from "./taskCalendar";
import {
  TASK_CALENDAR_GRID_END_HOUR,
  TASK_CALENDAR_GRID_MINUTES_PER_HOUR,
  TASK_CALENDAR_GRID_START_HOUR,
  taskCalendarGridPlacement
} from "./taskCalendarAgendaGrid";
import type { TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";
import { TaskCalendarEventModal } from "./taskCalendarEventModal";
import { TaskCalendarEventDetailModal } from "./taskCalendarEventDetailModal";
import { QuickCaptureModal } from "./modal";

export const MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE = "memos-plus-task-calendar-view";

const NAVIGATION: ReadonlyArray<{ id: TaskCalendarNavigation; icon: string; labelKey: Parameters<typeof t>[1] }> = [
  { id: "today", icon: "sun", labelKey: "taskCalendar.nav.today" },
  { id: "tomorrow", icon: "sunrise", labelKey: "taskCalendar.nav.tomorrow" },
  { id: "week", icon: "calendar-range", labelKey: "taskCalendar.nav.week" },
  { id: "inbox", icon: "inbox", labelKey: "taskCalendar.nav.inbox" },
  { id: "overdue", icon: "alarm-clock", labelKey: "taskCalendar.nav.overdue" },
  { id: "all", icon: "list-todo", labelKey: "taskCalendar.nav.all" },
  { id: "completed", icon: "check-circle-2", labelKey: "taskCalendar.nav.completed" }
];

export class TaskCalendarView extends ItemView {
  private readonly agenda = new AppleCalendarAgendaService();
  private events: AppleCalendarAgendaEvent[] = [];
  private agendaError = "";
  private agendaLoading = false;
  private loadedAgendaKey = "";
  private availableCalendars: Array<{ name: string; writable: boolean }> = [];
  private unsubscribeTasks: (() => void) | null = null;
  private renderTimer: number | null = null;
  private renderVersion = 0;
  private taskQuery = "";
  private taskPriority: TaskPriorityFilterValue | "all" = "all";
  private taskProject: TaskCalendarProjectFilter | null = null;
  private taskProjects: TaskCalendarProjectFilter[] = [];
  private taskProjectsLoading = false;
  private visibleTaskCount = Platform.isMobile ? 40 : 80;
  private viewActive = false;

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
    this.viewActive = true;
    this.contentEl.addClass("memos-plus-task-calendar-view");
    this.unsubscribeTasks = this.plugin.taskIndex.onChange(() => this.scheduleRender());
    this.render();
    void this.loadTaskProjects();
  }

  async onClose(): Promise<void> {
    this.viewActive = false;
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
    this.open({ navigation: "today", selectedDate: todayTaskCalendarDate(), viewMode: "day" });
  }

  openInbox(): void {
    this.open({ navigation: "inbox", focusQuickTask: true });
  }

  openDefault(): void {
    const navigation = this.plugin.settings.taskCalendar.defaultView;
    this.open({ navigation, viewMode: navigation === "week" ? "week" : this.plugin.settings.taskCalendar.viewMode });
  }

  openAll(): void {
    this.open({ navigation: "all" });
  }

  open(options: TaskCalendarOpenOptions = {}): void {
    this.taskQuery = options.query?.trim().toLocaleLowerCase() ?? "";
    this.taskPriority = options.priority ?? "all";
    this.taskProject = options.project ?? null;
    this.visibleTaskCount = Platform.isMobile ? 40 : 80;
    const change: Partial<TaskCalendarSettings> = {};
    if (options.navigation) change.navigation = options.navigation;
    if (options.selectedDate) change.selectedDate = options.selectedDate;
    if (options.viewMode) change.viewMode = options.viewMode;
    if (Object.keys(change).length === 0) {
      this.render();
      if (options.focusQuickTask) window.requestAnimationFrame(() => this.focusQuickTaskInput());
      return;
    }
    void this.updateState(change).then(() => {
      if (options.focusQuickTask) this.focusQuickTaskInput();
    });
  }

  openEventComposer(): void {
    if (!this.agenda.isAvailable()) {
      new Notice(t(this.plugin.settings.language, "taskCalendar.calendarUnavailable"));
      return;
    }
    void this.plugin.appleSync.probe("calendar").then((probe) => {
      const calendars = probe.calendars.filter((calendar) => calendar.writable).map((calendar) => calendar.name);
      if (calendars.length === 0) {
        new Notice(t(this.plugin.settings.language, "notice.taskCalendarNoWritableCalendar"));
        return;
      }
      const configured = this.plugin.settings.taskCalendar.agendaCalendarNames.find((name) => calendars.includes(name));
      new TaskCalendarEventModal(this.plugin.app, {
        language: this.plugin.settings.language,
        date: this.plugin.settings.taskCalendar.selectedDate || todayTaskCalendarDate(),
        calendars,
        defaultCalendar: configured || calendars[0],
        createEvent: (input) => this.agenda.createEvent(input),
        onCreated: () => {
          this.loadedAgendaKey = "";
          this.scheduleRender();
        }
      }).open();
    }).catch((error) => {
      new Notice(t(this.plugin.settings.language, "notice.taskCalendarEventFailed").replace("{error}", error instanceof Error ? error.message : String(error)));
    });
  }

  private openEventDetails(event: AppleCalendarAgendaEvent): void {
    new TaskCalendarEventDetailModal(this.plugin.app, {
      language: this.plugin.settings.language,
      event,
      onCreateTask: (selectedEvent) => this.plugin.createTaskCalendarInboxTask(eventTaskText(selectedEvent), calendarEventLocalDate(selectedEvent.start)),
      onQuickCapture: (selectedEvent) => {
        new QuickCaptureModal(this.plugin.app, {
          settings: this.plugin.settings,
          store: this.plugin.store,
          persistSettings: () => this.plugin.persistSettings(),
          refreshViews: () => this.plugin.refreshViews(),
          resolveMarkdownLink: (text) => this.plugin.resolveMarkdownLink(text),
          selectProjectTargetOnMobile: (options) => this.plugin.selectProjectTargetOnMobile(options),
          initialContent: eventMemoText(selectedEvent),
          initialContentMode: "none"
        }).open();
      }
    }).open();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, Platform.isMobile ? 120 : 50);
  }

  private render(): void {
    if (!this.viewActive) return;
    try {
      this.renderContent();
    } catch (error) {
      console.error("[Memos Plus] Failed to render Schedule and Tasks", error);
      this.contentEl.empty();
      this.contentEl.addClass("memos-plus-task-calendar", Platform.isMobile ? "is-mobile" : "is-desktop");
      this.contentEl.createDiv({ cls: "memos-plus-task-calendar-agenda-message", text: t(this.plugin.settings.language, "taskCalendar.unavailable") });
    }
  }

  private renderContent(): void {
    const lang = this.plugin.settings.language;
    const state = this.plugin.settings.taskCalendar;
    const selectedDate = state.selectedDate || todayTaskCalendarDate();
    const items = this.plugin.taskIndex.getItems();
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
    const modeSwitch = headerActions.createDiv({ cls: "memos-plus-task-calendar-mode-switch", attr: { role: "tablist", "aria-label": t(lang, "taskCalendar.viewMode") } });
    for (const [modeId, labelKey] of [["day", "taskCalendar.mode.day"], ["week", "taskCalendar.mode.week"]] as const) {
      const mode = modeSwitch.createEl("button", {
        cls: state.viewMode === modeId ? "is-active" : "",
        text: t(lang, labelKey),
        attr: { type: "button", role: "tab", "aria-selected": String(state.viewMode === modeId) }
      });
      mode.addEventListener("click", () => {
        if (state.viewMode !== modeId) void this.updateState({ viewMode: modeId });
      });
    }
    this.iconButton(headerActions, "message-square-plus", t(lang, "command.quickCapture"), () => this.plugin.openTaskCalendarQuickCapture());
    this.iconButton(headerActions, "calendar-plus", t(lang, "taskCalendar.newEvent"), () => this.openEventComposer());
    this.iconButton(headerActions, "refresh-cw", t(lang, "taskCalendar.refresh"), () => void this.refreshScheduleAndTasks(
      range.startDate,
      range.endDate,
      state.agendaCalendarNames,
      state.agendaCalendarNames.length === 0
    ));

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
    this.renderMiniCalendar(navigation, selectedDate);
    for (const item of NAVIGATION) {
      const button = navigation.createEl("button", { cls: `memos-plus-task-calendar-nav${state.navigation === item.id ? " is-active" : ""}`, attr: { type: "button", "data-nav": item.id } });
      setIcon(button, item.icon);
      button.createSpan({ text: t(lang, item.labelKey) });
      button.addEventListener("click", () => void this.openNavigation(item.id));
    }
    this.renderCalendarFilters(navigation);

    const agenda = layout.createDiv({ cls: "memos-plus-task-calendar-agenda" });
    this.renderAgenda(agenda, range.days, selectedDate, state.showAllDayEvents);

    const taskPane = layout.createDiv({ cls: "memos-plus-task-calendar-tasks" });
    const taskHeader = taskPane.createDiv({ cls: "memos-plus-task-calendar-pane-header" });
    taskHeader.createEl("h3", {
      text: [t(lang, `taskCalendar.nav.${state.navigation}`), this.taskProject?.label].filter(Boolean).join(" · ")
    });
    const hideTasks = this.iconButton(taskHeader, state.tasksPaneHidden ? "panel-right-open" : "panel-right-close", t(lang, "taskCalendar.toggleTasks"), () => void this.updateState({ tasksPaneHidden: !state.tasksPaneHidden }));
    hideTasks.addClass("memos-plus-task-calendar-tasks-toggle");
    const quick = taskPane.createEl("input", { cls: "memos-plus-task-calendar-quick-input", attr: { type: "text", placeholder: t(lang, "taskCalendar.quickTask"), "aria-label": t(lang, "taskCalendar.quickTask") } });
    quick.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const text = quick.value.trim();
      if (!text) return;
      const projectTag = this.taskProject?.tag?.replace(/^#+/, "").trim() ?? "";
      const taskText = projectTag && !taskLineContainsTag(text, projectTag) ? `${text} #${projectTag}` : text;
      quick.disabled = true;
      void this.plugin.createTaskCalendarInboxTask(taskText, state.navigation === "today" ? selectedDate : "").then((created) => {
        if (created) quick.value = "";
      }).finally(() => { if (quick.isConnected) quick.disabled = false; });
    });
    this.renderTaskControls(taskPane, items, state.navigation, selectedDate);
    const calendarNames = state.agendaCalendarNames;
    const agendaKey = this.agendaKey(range.startDate, range.endDate, calendarNames);
    if (this.loadedAgendaKey !== agendaKey && !this.agendaLoading) {
      void this.loadAgenda(range.startDate, range.endDate, calendarNames, state.agendaCalendarNames.length === 0, false);
    }
  }

  private renderMiniCalendar(container: HTMLElement, selectedDate: string): void {
    const lang = this.plugin.settings.language;
    const mini = container.createDiv({ cls: "memos-plus-task-calendar-mini-calendar" });
    const header = mini.createDiv({ cls: "memos-plus-task-calendar-mini-calendar-header" });
    this.iconButton(header, "chevron-left", t(lang, "taskCalendar.previousMonth"), () => {
      void this.updateState({ selectedDate: shiftTaskCalendarMonth(selectedDate, -1) });
    });
    header.createSpan({ text: formatTaskCalendarMonth(selectedDate, lang === "zh" ? "zh-CN" : "en-US") });
    this.iconButton(header, "chevron-right", t(lang, "taskCalendar.nextMonth"), () => {
      void this.updateState({ selectedDate: shiftTaskCalendarMonth(selectedDate, 1) });
    });
    const weekdays = mini.createDiv({ cls: "memos-plus-task-calendar-mini-weekdays", attr: { "aria-hidden": "true" } });
    for (const label of lang === "zh" ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"]) weekdays.createSpan({ text: label });
    const days = mini.createDiv({ cls: "memos-plus-task-calendar-mini-days" });
    for (const day of taskCalendarMonthDays(selectedDate)) {
      const button = days.createEl("button", {
        cls: `${day.inCurrentMonth ? "" : "is-outside"}${day.date === selectedDate ? " is-selected" : ""}${day.isToday ? " is-today" : ""}`,
        text: String(day.day),
        attr: { type: "button", "aria-label": day.date }
      });
      button.addEventListener("click", () => void this.updateState({ selectedDate: day.date, navigation: "today", viewMode: "day" }));
    }
  }

  private renderCalendarFilters(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const section = container.createDiv({ cls: "memos-plus-task-calendar-calendar-filters" });
    const heading = section.createDiv({ cls: "memos-plus-task-calendar-calendar-filters-heading" });
    heading.createSpan({ text: t(lang, "taskCalendar.calendars") });
    const all = heading.createEl("button", { text: t(lang, "taskCalendar.showAllCalendars"), attr: { type: "button" } });
    all.addEventListener("click", () => void this.updateState({ agendaCalendarNames: choices.map((calendar) => calendar.name) }));
    const choices = this.availableCalendars.length > 0
      ? this.availableCalendars
      : uniqueCalendarChoices(this.events.map((event) => event.calendar));
    if (choices.length === 0) {
      section.createDiv({ cls: "memos-plus-task-calendar-calendar-filter-status", text: this.agendaLoading ? t(lang, "taskCalendar.loading") : t(lang, "taskCalendar.calendarsUnavailable") });
      return;
    }
    const selected = this.effectiveAgendaCalendarNames();
    for (const calendar of choices) {
      const label = section.createEl("label", { cls: "memos-plus-task-calendar-calendar-filter" });
      const input = label.createEl("input", { type: "checkbox", attr: { "aria-label": calendar.name } });
      input.checked = selected.includes(calendar.name);
      input.addEventListener("change", () => {
        input.disabled = true;
        void this.toggleCalendarFilter(calendar.name, input.checked, choices.map((item) => item.name)).finally(() => { if (input.isConnected) input.disabled = false; });
      });
      const swatch = label.createSpan({ cls: "memos-plus-task-calendar-calendar-swatch", attr: { "aria-hidden": "true" } });
      swatch.style.setProperty("--memos-plus-calendar-color", colorForCalendar(calendar.name));
      label.createSpan({ text: calendar.name });
    }
  }

  private async toggleCalendarFilter(name: string, checked: boolean, allNames: string[]): Promise<void> {
    const current = this.effectiveAgendaCalendarNames();
    const selected = new Set(current);
    if (checked) selected.add(name);
    else selected.delete(name);
    const defaultNames = taskCalendarDefaultAgendaNames(allNames);
    const nextNames = allNames.filter((calendar) => selected.has(calendar));
    const next = sameCalendarNames(nextNames, defaultNames) ? [] : nextNames;
    this.loadedAgendaKey = "";
    await this.updateState({ agendaCalendarNames: next });
  }

  private renderAgenda(container: HTMLElement, days: string[], selectedDate: string, showAllDayEvents: boolean): void {
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
    const eventByDay = new Map(days.map((day) => [day, this.events.filter((event) => calendarEventLocalDate(event.start) === day || (event.allDay && calendarEventLocalDate(event.end) === day))]));
    const scheduler = container.createDiv({ cls: "memos-plus-task-calendar-scheduler" });
    scheduler.style.setProperty("--memos-plus-calendar-days", String(days.length));
    scheduler.style.setProperty("--memos-plus-calendar-hour-height", `${TASK_CALENDAR_GRID_MINUTES_PER_HOUR}px`);
    scheduler.style.setProperty("--memos-plus-calendar-grid-height", `${(TASK_CALENDAR_GRID_END_HOUR - TASK_CALENDAR_GRID_START_HOUR) * TASK_CALENDAR_GRID_MINUTES_PER_HOUR}px`);

    const dayHeaders = scheduler.createDiv({ cls: "memos-plus-task-calendar-day-headers" });
    dayHeaders.createDiv({ cls: "memos-plus-task-calendar-time-gutter", attr: { "aria-hidden": "true" } });
    for (const day of days) {
      const button = dayHeaders.createEl("button", {
        cls: `memos-plus-task-calendar-grid-day-header${day === selectedDate ? " is-selected" : ""}${day === todayTaskCalendarDate() ? " is-today" : ""}`,
        text: formatTaskCalendarDate(day, lang === "zh" ? "zh-CN" : "en-US"),
        attr: { type: "button" }
      });
      button.addEventListener("click", () => void this.updateState({ selectedDate: day, navigation: "today", viewMode: "day" }));
    }

    if (showAllDayEvents) {
      const allDayRow = scheduler.createDiv({ cls: "memos-plus-task-calendar-all-day-row" });
      allDayRow.createDiv({ cls: "memos-plus-task-calendar-time-gutter", text: t(lang, "taskCalendar.allDay") });
      for (const day of days) {
        const cell = allDayRow.createDiv({ cls: "memos-plus-task-calendar-all-day-cell" });
        for (const event of (eventByDay.get(day) ?? []).filter((event) => event.allDay)) this.renderEvent(cell, event, "all-day-grid");
      }
    }

    const grid = scheduler.createDiv({ cls: "memos-plus-task-calendar-time-grid" });
    const labels = grid.createDiv({ cls: "memos-plus-task-calendar-time-labels", attr: { "aria-hidden": "true" } });
    for (let hour = TASK_CALENDAR_GRID_START_HOUR; hour <= TASK_CALENDAR_GRID_END_HOUR; hour += 1) {
      labels.createDiv({ cls: "memos-plus-task-calendar-hour-label", text: `${String(hour).padStart(2, "0")}:00` });
    }
    const columns = grid.createDiv({ cls: "memos-plus-task-calendar-time-columns" });
    for (const [dayIndex, day] of days.entries()) {
      const column = columns.createDiv({ cls: `memos-plus-task-calendar-time-column${day === todayTaskCalendarDate() ? " is-today" : ""}` });
      const timed = (eventByDay.get(day) ?? []).filter((event) => !event.allDay);
      for (const event of timed) {
        const placement = taskCalendarGridPlacement(event, days);
        if (!placement || placement.dayIndex !== dayIndex) continue;
        this.renderEvent(column, event, "timed-grid", placement.top, placement.height);
      }
      if (timed.length === 0) column.createDiv({ cls: "memos-plus-task-calendar-grid-empty", text: days.length === 1 ? t(lang, "taskCalendar.emptyAgenda") : "" });
    }
  }

  private renderEvent(container: HTMLElement, event: AppleCalendarAgendaEvent, variant = "", top?: number, height?: number): void {
    const eventEl = container.createEl("button", {
      cls: `memos-plus-task-calendar-event${variant ? ` is-${variant}` : ""}`,
      attr: { type: "button", title: [event.location, event.notes].filter(Boolean).join("\n"), "aria-label": event.title }
    });
    eventEl.style.setProperty("--memos-plus-calendar-color", colorForCalendar(event.calendar));
    if (typeof top === "number") eventEl.style.top = `${top}px`;
    if (typeof height === "number") eventEl.style.height = `${height}px`;
    if (!event.allDay) eventEl.createSpan({ cls: "memos-plus-task-calendar-time", text: `${timePart(event.start)}–${timePart(event.end)}` });
    const detail = eventEl.createDiv({ cls: "memos-plus-task-calendar-event-detail" });
    detail.createDiv({ cls: "memos-plus-task-calendar-event-title", text: event.title });
    const meta = [event.calendar, event.location, event.recurring ? "↻" : ""].filter(Boolean).join(" · ");
    if (meta) detail.createDiv({ cls: "memos-plus-task-calendar-event-meta", text: meta });
    eventEl.addEventListener("click", () => this.openEventDetails(event));
  }

  private renderTaskControls(
    container: HTMLElement,
    items: TaskIndexItem[],
    navigation: TaskCalendarNavigation,
    selectedDate: string
  ): void {
    const lang = this.plugin.settings.language;
    const controls = container.createDiv({ cls: "memos-plus-task-calendar-task-controls" });
    const search = controls.createEl("input", {
      cls: "memos-plus-task-calendar-task-search",
      value: this.taskQuery,
      attr: {
        type: "search",
        placeholder: t(lang, "taskManager.searchPlaceholder"),
        "aria-label": t(lang, "taskManager.searchPlaceholder")
      }
    });
    const priority = controls.createEl("select", {
      cls: "memos-plus-task-calendar-task-priority",
      attr: { "aria-label": t(lang, "taskManager.priority") }
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
      const option = priority.createEl("option", { value, text: t(lang, labelKey) });
      option.selected = value === this.taskPriority;
    }

    const projects = this.taskProjects;
    const project = controls.createEl("select", {
      cls: "memos-plus-task-calendar-task-project",
      attr: { "aria-label": t(lang, "taskCalendar.projectFilter") }
    });
    project.createEl("option", { value: "", text: t(lang, "taskCalendar.allProjects") });
    for (const [index, candidate] of projects.entries()) {
      const option = project.createEl("option", { value: String(index), text: candidate.label });
      option.selected = sameProjectFilter(candidate, this.taskProject);
    }
    if (this.taskProject && !projects.some((candidate) => sameProjectFilter(candidate, this.taskProject))) {
      const option = project.createEl("option", { value: "active", text: this.taskProject.label });
      option.selected = true;
    }

    const results = container.createDiv({ cls: "memos-plus-task-calendar-task-results" });
    const renderResults = (): void => {
      results.empty();
      const tasks = taskCalendarTasks(items, navigation, selectedDate, {
        query: this.taskQuery,
        priority: this.taskPriority,
        project: this.taskProject
      });
      results.createDiv({
        cls: "memos-plus-task-calendar-task-summary",
        text: t(lang, "taskCalendar.taskCount").replace("{count}", String(tasks.length))
      });
      const taskList = results.createDiv({ cls: "memos-plus-task-calendar-task-list" });
      if (tasks.length === 0) {
        taskList.createDiv({ cls: "memos-plus-empty", text: t(lang, "taskCalendar.emptyTasks") });
        return;
      }
      for (const task of tasks.slice(0, this.visibleTaskCount)) this.renderTask(taskList, task, selectedDate);
      if (tasks.length > this.visibleTaskCount) {
        const more = results.createEl("button", {
          cls: "memos-plus-load-more memos-plus-task-calendar-load-more",
          text: t(lang, "taskCalendar.loadMore").replace("{count}", String(tasks.length - this.visibleTaskCount)),
          attr: { type: "button" }
        });
        more.addEventListener("click", () => {
          this.visibleTaskCount += Platform.isMobile ? 40 : 80;
          renderResults();
        });
      }
    };

    search.addEventListener("input", () => {
      this.taskQuery = search.value.trim().toLocaleLowerCase();
      this.visibleTaskCount = Platform.isMobile ? 40 : 80;
      renderResults();
    });
    priority.addEventListener("change", () => {
      this.taskPriority = priority.value as TaskPriorityFilterValue | "all";
      this.visibleTaskCount = Platform.isMobile ? 40 : 80;
      renderResults();
    });
    project.addEventListener("change", () => {
      if (project.value === "active") return;
      const index = project.value === "" ? -1 : Number(project.value);
      this.taskProject = Number.isInteger(index) && index >= 0 ? projects[index] ?? null : null;
      this.visibleTaskCount = Platform.isMobile ? 40 : 80;
      renderResults();
      taskHeaderTitle(container, navigation, this.taskProject?.label ?? "", lang);
    });
    renderResults();
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
    body.createDiv({
      cls: "memos-plus-task-calendar-task-meta",
      text: [date && (date < selectedDate ? t(this.plugin.settings.language, "taskCalendar.overdue") : date), priorityLabel(task.priority), task.filePath].filter(Boolean).join(" · ")
    });
    body.addEventListener("click", () => void this.plugin.openTaskCalendarTask(task));
    if (this.plugin.canEditTaskCalendarTask()) {
      const edit = this.iconButton(item, "pencil", t(this.plugin.settings.language, "common.edit"), () => {
        edit.disabled = true;
        void this.plugin.editTaskCalendarTask(task).finally(() => { if (edit.isConnected) edit.disabled = false; });
      });
      edit.addClass("memos-plus-task-calendar-task-edit");
    }
  }

  private async loadAgenda(startDate: string, endDate: string, calendarNames: string[], excludeGeneratedCalendars: boolean, force: boolean): Promise<void> {
    const settings = this.plugin.settings;
    if (!this.agenda.isAvailable()) {
      this.events = [];
      this.agendaError = t(settings.language, "taskCalendar.calendarUnavailable");
      this.agendaLoading = false;
      return;
    }
    if (this.agendaLoading && !force) return;
    const version = ++this.renderVersion;
    const agendaKey = this.agendaKey(startDate, endDate, calendarNames);
    this.agendaLoading = true;
    this.agendaError = "";
    this.scheduleRender();
    if (force) this.agenda.clearCache();
    try {
      const result = await this.agenda.listEvents({
        startDate,
        endDate,
        calendarNames,
        excludeGeneratedCalendars,
        cacheMinutes: settings.taskCalendar.agendaCacheMinutes
      });
      if (version !== this.renderVersion || !this.viewActive) return;
      this.events = result.events;
      this.availableCalendars = uniqueCalendarChoices(result.calendars);
      this.loadedAgendaKey = agendaKey;
    } catch (error) {
      if (version !== this.renderVersion || !this.viewActive) return;
      this.events = [];
      this.agendaError = error instanceof Error ? error.message : String(error);
      this.loadedAgendaKey = agendaKey;
    } finally {
      if (version === this.renderVersion && this.viewActive) {
        this.agendaLoading = false;
        this.render();
      }
    }
  }

  private async refreshScheduleAndTasks(startDate: string, endDate: string, calendarNames: string[], excludeGeneratedCalendars: boolean): Promise<void> {
    const operations: Promise<unknown>[] = [
      this.loadAgenda(startDate, endDate, calendarNames, excludeGeneratedCalendars, true),
      this.plugin.refreshTaskCalendarTasks()
    ];
    await Promise.allSettled(operations);
  }

  private async loadTaskProjects(): Promise<void> {
    if (this.taskProjectsLoading) return;
    this.taskProjectsLoading = true;
    try {
      const projects = await this.plugin.store.getProjects();
      this.taskProjects = projects.map((project) => ({
        label: project.name,
        filePath: project.file.path,
        tag: `${this.plugin.settings.projectTag}/${project.name}`
      }));
      if (!this.contentEl.querySelector(".memos-plus-task-calendar-quick-input:focus, .memos-plus-task-calendar-task-controls :focus")) {
        this.scheduleRender();
      }
    } catch (error) {
      console.warn("[Memos Plus] Failed to load task project filters", error);
    } finally {
      this.taskProjectsLoading = false;
    }
  }

  private effectiveAgendaCalendarNames(): string[] {
    const configured = this.plugin.settings.taskCalendar.agendaCalendarNames;
    if (configured.length > 0) return configured;
    return taskCalendarDefaultAgendaNames(this.availableCalendars.map((calendar) => calendar.name));
  }

  private agendaKey(startDate: string, endDate: string, calendarNames: string[]): string {
    const settings = this.plugin.settings;
    return `${startDate}:${endDate}:${calendarNames.join("\u0001")}:${settings.taskCalendar.showAllDayEvents}`;
  }

  private openNavigation(navigation: TaskCalendarNavigation): void {
    this.resetTaskFilters();
    if (navigation === "today") {
      void this.updateState({ navigation: "today", selectedDate: todayTaskCalendarDate(), viewMode: "day" });
      return;
    }
    if (navigation === "tomorrow") {
      void this.updateState({ navigation, selectedDate: shiftDate(todayTaskCalendarDate(), "day", 1), viewMode: "day" });
      return;
    }
    if (navigation === "week") {
      void this.updateState({ navigation, selectedDate: todayTaskCalendarDate(), viewMode: "week" });
      return;
    }
    void this.updateState({ navigation });
  }

  private resetTaskFilters(): void {
    this.taskQuery = "";
    this.taskPriority = "all";
    this.taskProject = null;
    this.visibleTaskCount = Platform.isMobile ? 40 : 80;
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

function calendarEventLocalDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function colorForCalendar(name: string): string {
  const palette = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee"];
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function uniqueCalendarChoices(values: Array<string | { name: string; writable: boolean }>): Array<{ name: string; writable: boolean }> {
  const result: Array<{ name: string; writable: boolean }> = [];
  const seen = new Set<string>();
  for (const value of values) {
    const name = (typeof value === "string" ? value : value.name).trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push({ name, writable: typeof value === "string" ? false : value.writable });
  }
  return result;
}

function sameCalendarNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((name, index) => name === right[index]);
}

function sameProjectFilter(left: TaskCalendarProjectFilter, right: TaskCalendarProjectFilter | null): boolean {
  return Boolean(right) && left.label === right?.label && left.filePath === right?.filePath && left.tag === right?.tag;
}

function taskLineContainsTag(line: string, tag: string): boolean {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)#${escaped}(?=$|\\s|[.,，。;；:：!?！？)])`, "iu").test(line);
}

function taskHeaderTitle(container: HTMLElement, navigation: TaskCalendarNavigation, project: string, lang: "zh" | "en"): void {
  const heading = container.querySelector<HTMLElement>(":scope > .memos-plus-task-calendar-pane-header h3");
  if (heading) heading.setText([t(lang, `taskCalendar.nav.${navigation}`), project].filter(Boolean).join(" · "));
}

function priorityLabel(priority: TaskIndexItem["priority"]): string {
  return ({ highest: "🔺", high: "⏫", medium: "🔼", low: "🔽", lowest: "⏬", none: "" } as const)[priority] || "";
}

function eventTaskText(event: AppleCalendarAgendaEvent): string {
  const details = [event.calendar, event.location, event.allDay ? "全天" : `${timePart(event.start)}–${timePart(event.end)}`].filter(Boolean).join(" · ");
  return details ? `${event.title}（${details}）` : event.title;
}

function eventMemoText(event: AppleCalendarAgendaEvent): string {
  const time = event.allDay ? "全天" : `${calendarEventLocalDate(event.start)} ${timePart(event.start)}–${timePart(event.end)}`;
  const details = [time, event.calendar, event.location].filter(Boolean).join(" · ");
  return [event.title, details, event.notes].filter(Boolean).join("\n");
}
