import { ItemView, Menu, Notice, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
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
  taskCalendarCompletedOnDate,
  taskCalendarTasks,
  toggleTaskCalendarSidebar,
  taskDate,
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
  taskCalendarDropTime,
  taskCalendarGridPlacement,
  taskCalendarTimedTaskPlacement
} from "./taskCalendarAgendaGrid";
import type { TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";
import type { TaskRecurrence } from "./tasksFormat";
import type { ProjectTaskOptions } from "./tasksFormat";
import { parseNaturalLanguageTask, type ParsedNaturalLanguageTask } from "./taskNaturalLanguage";
import { TaskCalendarEventModal } from "./taskCalendarEventModal";
import { TaskCalendarEventDetailModal } from "./taskCalendarEventDetailModal";
import { QuickCaptureModal } from "./modal";
import {
  parseTaskCalendarDetailMetadata,
  taskCalendarPostponeDate,
  taskCalendarTaskKey,
  taskCalendarTaskProjectTag,
  taskCalendarTaskRecurrence,
  taskCalendarTaskTags,
  type TaskCalendarTaskPatch
} from "./taskCalendarTaskEditor";
import { TaskCalendarEditSession, type TaskCalendarEditSnapshot } from "./taskCalendarEditSession";

export const MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE = "memos-plus-task-calendar-view";

const NAVIGATION: ReadonlyArray<{ id: TaskCalendarNavigation; icon: string; labelKey: Parameters<typeof t>[1] }> = [
  { id: "today", icon: "sun", labelKey: "taskCalendar.nav.today" },
  { id: "inbox", icon: "inbox", labelKey: "taskCalendar.nav.inbox" },
  { id: "upcoming", icon: "calendar-range", labelKey: "taskCalendar.nav.upcoming" },
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
  private selectedTaskKey = "";
  private taskEditSession: TaskCalendarEditSession | null = null;
  private draggingTask: TaskIndexItem | null = null;
  private projectNavExpanded = false;
  private hideCompletedToday = false;
  private quickTaskDraft = "";
  private quickTaskPreview: ParsedNaturalLanguageTask | null = null;

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
    this.unsubscribeTasks = this.plugin.taskIndex.onChange(() => this.handleTaskIndexChange());
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
    this.releaseTaskEditSession();
    this.contentEl.empty();
  }

  focusQuickTaskInput(): void {
    this.contentEl.querySelector<HTMLInputElement>(".memos-plus-task-calendar-quick-input")?.focus();
  }

  openToday(): void {
    this.applyOpenOptions({ navigation: "today", selectedDate: todayTaskCalendarDate(), viewMode: "day" });
  }

  openInbox(): void {
    this.applyOpenOptions({ navigation: "inbox", focusQuickTask: true });
  }

  openDefault(): void {
    const navigation = this.plugin.settings.taskCalendar.defaultView;
    this.applyOpenOptions({ navigation, viewMode: navigation === "upcoming" ? "week" : this.plugin.settings.taskCalendar.viewMode });
  }

  openAll(): void {
    this.applyOpenOptions({ navigation: "all" });
  }

  applyOpenOptions(options: TaskCalendarOpenOptions = {}): void {
    this.taskQuery = options.query?.trim().toLocaleLowerCase() ?? "";
    this.taskPriority = options.priority ?? "all";
    this.taskProject = options.project ?? null;
    if (options.project) this.projectNavExpanded = true;
    this.visibleTaskCount = Platform.isMobile ? 40 : 80;
    const change: Partial<TaskCalendarSettings> = {};
    if (options.navigation) change.navigation = options.navigation;
    if (options.selectedDate) change.selectedDate = options.selectedDate;
    if (options.viewMode) change.viewMode = options.viewMode;
    if (Object.keys(change).length === 0) {
      this.renderForced();
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
    this.renderWithOptions(false);
  }

  private renderForced(): void {
    this.renderWithOptions(true);
  }

  private renderWithOptions(force: boolean): void {
    if (!this.viewActive) return;
    if (!force && this.selectedTaskKey && this.contentEl.querySelector(".memos-plus-task-calendar-task-details")) return;
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
    const responsiveSidebarCollapsed = !Platform.isMobile
      && !state.sidebarCollapsed
      && !state.sidebarExpandedManually
      && root.clientWidth <= 1080;
    root.setAttr("data-mobile-tab", state.mobileTab);
    root.toggleClass("is-sidebar-collapsed", !Platform.isMobile && state.sidebarCollapsed);
    root.toggleClass("is-sidebar-force-expanded", !Platform.isMobile && state.sidebarExpandedManually && !state.sidebarCollapsed);
    root.toggleClass("is-tasks-hidden", !Platform.isMobile && state.tasksPaneHidden);
    root.style.setProperty("--memos-plus-task-calendar-nav-width", `${state.navigationWidth}px`);
    root.style.setProperty("--memos-plus-task-calendar-task-width", `${state.taskPaneWidth}px`);

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
    const create = this.iconButton(headerActions, "plus", t(lang, "taskCalendar.new"), () => undefined);
    create.addEventListener("click", (event) => this.openCreateMenu(event));
    this.iconButton(headerActions, "refresh-cw", t(lang, "taskCalendar.refresh"), () => void this.refreshScheduleAndTasks(
      range.startDate,
      range.endDate,
      state.agendaCalendarNames,
      state.agendaCalendarNames.length === 0
    ));

    if (state.navigation === "today") this.renderTodaySummary(root, items, selectedDate);

    if (Platform.isMobile) {
      const tabs = root.createDiv({ cls: "memos-plus-task-calendar-mobile-tabs", attr: { role: "tablist" } });
      for (const [id, label] of [["today", "taskCalendar.mobile.today"], ["tasks", "taskCalendar.mobile.tasks"], ["calendar", "taskCalendar.mobile.calendar"]] as const) {
        const tab = tabs.createEl("button", { cls: state.mobileTab === id ? "is-active" : "", text: t(lang, label), attr: { type: "button", role: "tab", "aria-selected": String(state.mobileTab === id) } });
        tab.addEventListener("click", () => void this.updateState({ mobileTab: id }));
      }
    }

    const layout = root.createDiv({ cls: "memos-plus-task-calendar-layout" });
    const navigation = layout.createDiv({ cls: "memos-plus-task-calendar-navigation" });
    const sidebarLooksCollapsed = !Platform.isMobile && (state.sidebarCollapsed || responsiveSidebarCollapsed);
    const collapse = this.iconButton(navigation, sidebarLooksCollapsed ? "panel-left-open" : "panel-left-close", t(lang, "taskCalendar.collapse"), () => {
      if (Platform.isMobile) return;
      void this.updateState(toggleTaskCalendarSidebar(state, responsiveSidebarCollapsed, false));
    });
    collapse.addClass("memos-plus-task-calendar-collapse");
    this.renderMiniCalendar(navigation, selectedDate);
    const primaryNavigation = navigation.createDiv({ cls: "memos-plus-task-calendar-primary-navigation" });
    for (const item of NAVIGATION) {
      const button = primaryNavigation.createEl("button", { cls: `memos-plus-task-calendar-nav${state.navigation === item.id ? " is-active" : ""}`, attr: { type: "button", "data-nav": item.id } });
      setIcon(button, item.icon);
      button.createSpan({ text: t(lang, item.labelKey) });
      button.addEventListener("click", () => void this.openNavigation(item.id));
    }
    const projectSection = navigation.createDiv({ cls: "memos-plus-task-calendar-project-section" });
    this.renderProjectNavigation(projectSection);
    const calendarSection = navigation.createDiv({ cls: "memos-plus-task-calendar-calendar-section" });
    const calendarNav = calendarSection.createEl("button", { cls: "memos-plus-task-calendar-nav memos-plus-task-calendar-calendar-nav", attr: { type: "button" } });
    setIcon(calendarNav, "calendar-days");
    calendarNav.createSpan({ text: t(lang, "taskCalendar.calendars") });
    calendarNav.addEventListener("click", () => {
      if (Platform.isMobile) void this.updateState({ mobileTab: "calendar" });
      else this.contentEl.querySelector<HTMLElement>(".memos-plus-task-calendar-agenda")?.focus();
    });
    this.renderCalendarFilters(calendarSection);

    this.renderResizeHandle(layout, "left", state.navigationWidth);

    const agenda = layout.createDiv({ cls: "memos-plus-task-calendar-agenda" });
    agenda.tabIndex = -1;
    const agendaTasks = this.taskProject
      ? taskCalendarTasks(items, "all", selectedDate, { project: this.taskProject })
      : items;
    this.renderAgenda(agenda, range.days, selectedDate, state.showAllDayEvents, agendaTasks);

    this.renderResizeHandle(layout, "right", state.taskPaneWidth);

    const taskPane = layout.createDiv({ cls: "memos-plus-task-calendar-tasks" });
    const taskHeader = taskPane.createDiv({ cls: "memos-plus-task-calendar-pane-header" });
    taskHeader.createEl("h3", {
      text: [t(lang, `taskCalendar.nav.${state.navigation}`), this.taskProject?.label].filter(Boolean).join(" · ")
    });
    const hideTasks = this.iconButton(taskHeader, state.tasksPaneHidden ? "panel-right-open" : "panel-right-close", t(lang, "taskCalendar.toggleTasks"), () => void this.updateState({ tasksPaneHidden: !state.tasksPaneHidden }));
    hideTasks.addClass("memos-plus-task-calendar-tasks-toggle");
    const appleSyncError = this.plugin.settings.appleSyncState.lastError.trim();
    if (appleSyncError) {
      taskPane.createDiv({
        cls: "memos-plus-task-calendar-reminders-error",
        text: `${t(lang, "taskCalendar.appleFailed")}: ${appleSyncError}`,
        attr: { title: appleSyncError, role: "status" }
      });
    }
    const selectedTask = this.selectedTask(items);
    if (selectedTask) {
      this.renderTaskDetails(taskPane, selectedTask);
    } else {
      const quickComposer = taskPane.createDiv({ cls: "memos-plus-task-calendar-quick-composer" });
      const quick = quickComposer.createEl("input", { cls: "memos-plus-task-calendar-quick-input", attr: { type: "text", placeholder: t(lang, "taskCalendar.quickTask"), "aria-label": t(lang, "taskCalendar.quickTask") } });
      quick.value = this.quickTaskDraft;
      const preview = quickComposer.createDiv({ cls: "memos-plus-task-calendar-quick-preview" });
      const renderPreview = (): void => this.renderQuickTaskPreview(preview, quick, state.navigation === "today" ? selectedDate : "");
      quick.addEventListener("input", () => {
        this.quickTaskDraft = quick.value;
        this.quickTaskPreview = null;
        preview.empty();
      });
      quick.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        const text = quick.value.trim();
        if (!text) return;
        this.quickTaskDraft = text;
        this.quickTaskPreview = parseNaturalLanguageTask(text);
        renderPreview();
      });
      if (this.quickTaskPreview) renderPreview();
      this.renderTaskControls(taskPane, items, state.navigation, selectedDate);
    }
    const calendarNames = state.agendaCalendarNames;
    const agendaKey = this.agendaKey(range.startDate, range.endDate, calendarNames);
    if (this.loadedAgendaKey !== agendaKey && !this.agendaLoading) {
      void this.loadAgenda(range.startDate, range.endDate, calendarNames, state.agendaCalendarNames.length === 0, false);
    }
  }

  private openCreateMenu(event: MouseEvent): void {
    const lang = this.plugin.settings.language;
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(t(lang, "taskCalendar.quickAction.task"))
      .setIcon("list-plus")
      .onClick(() => {
        this.selectedTaskKey = "";
        void this.updateState({ tasksPaneHidden: false, mobileTab: "tasks" }).then(() => this.focusQuickTaskInput());
      }));
    menu.addItem((item) => item
      .setTitle(t(lang, "taskCalendar.quickAction.event"))
      .setIcon("calendar-plus")
      .onClick(() => this.openEventComposer()));
    menu.addItem((item) => item
      .setTitle(t(lang, "taskCalendar.quickAction.memo"))
      .setIcon("message-square-plus")
      .onClick(() => this.plugin.openTaskCalendarQuickCapture()));
    menu.showAtMouseEvent(event);
  }

  private renderTodaySummary(container: HTMLElement, items: TaskIndexItem[], selectedDate: string): void {
    const lang = this.plugin.settings.language;
    const incomplete = items.filter((item) => !item.completed);
    const dueToday = incomplete.filter((item) => taskDate(item) === selectedDate);
    const overdue = incomplete.filter((item) => Boolean(item.dueDate && item.dueDate < selectedDate));
    const completedToday = items.filter((item) => taskCalendarCompletedOnDate(item, selectedDate));
    const events = this.events.filter((event) => calendarEventLocalDate(event.start) === selectedDate);
    const next = nextScheduleLabel(dueToday, events, selectedDate);
    const summary = container.createDiv({ cls: "memos-plus-task-calendar-today-summary", attr: { "aria-label": t(lang, "taskCalendar.todaySummary") } });
    summaryCard(summary, t(lang, "taskCalendar.summary.todo"), String(dueToday.length));
    summaryCard(summary, t(lang, "taskCalendar.summary.overdue"), String(overdue.length), overdue.length > 0 ? "is-warning" : "");
    summaryCard(summary, t(lang, "taskCalendar.summary.completed"), String(completedToday.length), "is-completed");
    summaryCard(summary, t(lang, "taskCalendar.summary.events"), String(events.length));
    summaryCard(summary, t(lang, "taskCalendar.summary.next"), next || t(lang, "taskCalendar.summary.none"), "is-wide");
  }

  private renderProjectNavigation(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const project = container.createEl("button", {
      cls: `memos-plus-task-calendar-nav${this.taskProject ? " is-active" : ""}`,
      attr: { type: "button", "aria-expanded": String(this.projectNavExpanded) }
    });
    setIcon(project, "folder-kanban");
    project.createSpan({ text: t(lang, "taskCalendar.projects") });
    const chevron = project.createSpan({ cls: "memos-plus-task-calendar-nav-chevron" });
    setIcon(chevron, this.projectNavExpanded ? "chevron-down" : "chevron-right");
    project.addEventListener("click", () => {
      this.projectNavExpanded = !this.projectNavExpanded;
      this.renderForced();
    });
    if (!this.projectNavExpanded) return;
    const list = container.createDiv({ cls: "memos-plus-task-calendar-project-nav-list" });
    for (const candidate of this.taskProjects) {
      const option = list.createEl("button", {
        cls: sameProjectFilter(candidate, this.taskProject) ? "is-active" : "",
        text: candidate.label,
        attr: { type: "button", title: candidate.filePath ?? candidate.tag ?? candidate.label }
      });
      option.addEventListener("click", () => {
        this.taskProject = candidate;
        this.selectedTaskKey = "";
        void this.updateState({ navigation: "all", tasksPaneHidden: false, mobileTab: "tasks" });
      });
    }
  }

  private renderResizeHandle(container: HTMLElement, side: "left" | "right", currentWidth: number): void {
    const handle = container.createDiv({
      cls: `memos-plus-task-calendar-resizer is-${side}`,
      attr: { role: "separator", tabindex: "0", "aria-orientation": "vertical", "aria-label": t(this.plugin.settings.language, side === "left" ? "taskCalendar.resizeNavigation" : "taskCalendar.resizeTasks") }
    });
    const minimum = side === "left" ? 200 : 340;
    const maximum = side === "left" ? 320 : 560;
    const apply = (value: number): number => {
      const width = Math.max(minimum, Math.min(maximum, Math.round(value)));
      const root = this.contentEl.querySelector<HTMLElement>(".memos-plus-task-calendar");
      root?.style.setProperty(side === "left" ? "--memos-plus-task-calendar-nav-width" : "--memos-plus-task-calendar-task-width", `${width}px`);
      return width;
    };
    handle.addEventListener("pointerdown", (event) => {
      if (Platform.isMobile) return;
      event.preventDefault();
      handle.addClass("is-active");
      const startX = event.clientX;
      let nextWidth = currentWidth;
      const win = this.contentEl.ownerDocument.defaultView;
      if (!win) return;
      const move = (moveEvent: PointerEvent): void => {
        nextWidth = apply(currentWidth + (moveEvent.clientX - startX) * (side === "left" ? 1 : -1));
      };
      const end = (): void => {
        handle.removeClass("is-active");
        win.removeEventListener("pointermove", move);
        win.removeEventListener("pointerup", end);
        void this.updateState(side === "left" ? { navigationWidth: nextWidth } : { taskPaneWidth: nextWidth });
      };
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", end, { once: true });
    });
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = apply(currentWidth + direction * 12 * (side === "left" ? 1 : -1));
      void this.updateState(side === "left" ? { navigationWidth: next } : { taskPaneWidth: next });
    });
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

  private renderAgenda(container: HTMLElement, days: string[], selectedDate: string, showAllDayEvents: boolean, tasks: TaskIndexItem[]): void {
    const lang = this.plugin.settings.language;
    const header = container.createDiv({ cls: "memos-plus-task-calendar-pane-header" });
    header.createEl("h3", { text: this.plugin.settings.taskCalendar.viewMode === "day" ? t(lang, "taskCalendar.todayAgenda") : t(lang, "taskCalendar.weekAgenda") });
    const headerStatus = header.createDiv({ cls: "memos-plus-task-calendar-agenda-actions" });
    const completedInRange = tasks.filter((task) => days.some((day) => taskCalendarCompletedOnDate(task, day)));
    if (completedInRange.length > 0) {
      const toggleCompleted = headerStatus.createEl("button", {
        cls: "memos-plus-task-calendar-completed-toggle",
        text: t(lang, this.hideCompletedToday ? "taskCalendar.showCompleted" : "taskCalendar.hideCompleted"),
        attr: { type: "button", "aria-pressed": String(this.hideCompletedToday) }
      });
      toggleCompleted.addEventListener("click", () => {
        this.hideCompletedToday = !this.hideCompletedToday;
        this.renderForced();
      });
    }
    if (this.agendaLoading) headerStatus.createSpan({ cls: "memos-plus-task-calendar-sync-status is-loading", text: t(lang, "taskCalendar.loading") });
    else if (this.agendaError) headerStatus.createSpan({ cls: "memos-plus-task-calendar-sync-status is-error", text: t(lang, "taskCalendar.unavailable") });
    else headerStatus.createSpan({ cls: "memos-plus-task-calendar-sync-status", text: t(lang, "taskCalendar.ready") });
    if (this.agendaError) {
      container.createDiv({ cls: "memos-plus-task-calendar-agenda-message", text: this.agendaError });
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

    if (!this.hideCompletedToday) {
      const completedWithoutTimeByDay = new Map(days.map((day) => [
        day,
        tasks.filter((task) => taskCalendarCompletedOnDate(task, day) && (!task.dueTime || task.allDay))
      ]));
      if (Array.from(completedWithoutTimeByDay.values()).some((items) => items.length > 0)) {
        const completedRow = scheduler.createDiv({ cls: "memos-plus-task-calendar-completed-row" });
        completedRow.createDiv({ cls: "memos-plus-task-calendar-time-gutter", text: t(lang, "taskCalendar.completedToday") });
        for (const day of days) {
          const cell = completedRow.createDiv({ cls: "memos-plus-task-calendar-completed-cell" });
          for (const task of completedWithoutTimeByDay.get(day) ?? []) this.renderCompletedTask(cell, task);
        }
      }
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
    const timedTasksByDay = new Map(days.map((day) => [
      day,
      tasks.filter((task) =>
        Boolean(task.dueTime)
        && !task.allDay
        && taskDate(task) === day
        && (!task.completed || (!this.hideCompletedToday && taskCalendarCompletedOnDate(task, day)))
      )
    ]));
    for (const [dayIndex, day] of days.entries()) {
      const column = columns.createDiv({ cls: `memos-plus-task-calendar-time-column${day === todayTaskCalendarDate() ? " is-today" : ""}` });
      column.setAttr("data-date", day);
      column.addEventListener("dragover", (event) => {
        if (!this.draggingTask) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        column.addClass("is-task-drop-target");
      });
      column.addEventListener("dragleave", (event) => {
        if (!(event.relatedTarget instanceof Node) || !column.contains(event.relatedTarget)) column.removeClass("is-task-drop-target");
      });
      column.addEventListener("drop", (event) => {
        event.preventDefault();
        column.removeClass("is-task-drop-target");
        const task = this.draggingTask;
        this.draggingTask = null;
        if (!task) return;
        const time = taskCalendarDropTime(event.clientY, column.getBoundingClientRect().top);
        void this.updateTask(task, { date: day, time });
      });
      const timed = (eventByDay.get(day) ?? []).filter((event) => !event.allDay);
      for (const event of timed) {
        const placement = taskCalendarGridPlacement(event, days);
        if (!placement || placement.dayIndex !== dayIndex) continue;
        this.renderEvent(column, event, "timed-grid", placement.top, placement.height);
      }
      const timedTasks = timedTasksByDay.get(day) ?? [];
      for (const task of timedTasks) {
        const placement = taskCalendarTimedTaskPlacement(task, days);
        if (!placement) continue;
        this.renderTimedTask(column, task, placement.top);
      }
      if (timed.length === 0 && timedTasks.length === 0) column.createDiv({
        cls: "memos-plus-task-calendar-grid-empty",
        text: days.length === 1 ? t(lang, "taskCalendar.dropHint") : ""
      });
    }
  }

  private renderTimedTask(container: HTMLElement, task: TaskIndexItem, top: number): void {
    const title = task.title || t(this.plugin.settings.language, "taskCalendar.untitledTask");
    const taskEl = container.createDiv({
      cls: `memos-plus-task-calendar-timed-task${task.completed ? " is-completed" : ""}`,
      attr: { title: `${task.dueTime} ${title}`, "aria-label": `${title} ${task.dueTime}`, draggable: "true" }
    });
    taskEl.style.top = `${top}px`;
    const checkbox = taskEl.createEl("input", { type: "checkbox", attr: { "aria-label": t(this.plugin.settings.language, "taskCalendar.completeTask").replace("{title}", title) } });
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => this.toggleTaskCompletionOptimistically(task, checkbox, taskEl));
    const body = taskEl.createEl("button", { cls: "memos-plus-task-calendar-timed-task-body", attr: { type: "button" } });
    body.createSpan({ cls: "memos-plus-task-calendar-timed-task-time", text: task.dueTime });
    body.createSpan({ cls: "memos-plus-task-calendar-timed-task-title", text: title });
    body.addEventListener("click", () => this.selectTask(task));
    this.prepareTaskDrag(taskEl, task);
  }

  private renderCompletedTask(container: HTMLElement, task: TaskIndexItem): void {
    const title = task.title || t(this.plugin.settings.language, "taskCalendar.untitledTask");
    const taskEl = container.createDiv({ cls: "memos-plus-task-calendar-completed-task is-completed" });
    const checkbox = taskEl.createEl("input", {
      type: "checkbox",
      attr: { "aria-label": t(this.plugin.settings.language, "taskCalendar.completeTask").replace("{title}", title) }
    });
    checkbox.checked = true;
    checkbox.addEventListener("change", () => this.toggleTaskCompletionOptimistically(task, checkbox, taskEl));
    const body = taskEl.createEl("button", { cls: "memos-plus-task-calendar-completed-task-body", attr: { type: "button", title } });
    body.createSpan({ text: title });
    body.addEventListener("click", () => this.selectTask(task));
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
      this.renderForced();
    });
    renderResults();
  }

  private renderQuickTaskPreview(container: HTMLElement, input: HTMLInputElement, fallbackDate: string): void {
    container.empty();
    const parsed = this.quickTaskPreview;
    if (!parsed) return;
    const lang = this.plugin.settings.language;
    container.createDiv({ cls: "memos-plus-task-calendar-quick-preview-title", text: t(lang, "taskCalendar.quickTaskPreview") });
    container.createDiv({ cls: "memos-plus-task-calendar-quick-preview-task", text: parsed.title });
    const metadata = container.createDiv({ cls: "memos-plus-task-calendar-quick-preview-meta" });
    if (!parsed.matched) metadata.createSpan({ text: t(lang, "taskCalendar.quickTaskUnparsed") });
    if (parsed.date) metadata.createSpan({ text: `${t(lang, "taskCalendar.quickTaskDate")} ${parsed.date}` });
    if (parsed.time) metadata.createSpan({ text: `${t(lang, "taskCalendar.quickTaskTime")} ${parsed.time}` });
    if (parsed.reminderMinutesBefore !== undefined) metadata.createSpan({ text: t(lang, "taskCalendar.quickTaskReminder").replace("{minutes}", String(parsed.reminderMinutesBefore)) });
    if (parsed.priority !== "none") metadata.createSpan({ text: `${t(lang, "taskCalendar.quickTaskPriority")} ${priorityDetails(parsed.priority, lang)}` });
    for (const tag of parsed.tags) metadata.createSpan({ text: tag });
    if (this.taskProject) metadata.createSpan({ text: `#${this.taskProject.tag?.replace(/^#+/u, "") || this.taskProject.label}` });

    const actions = container.createDiv({ cls: "memos-plus-task-calendar-quick-preview-actions" });
    const cancel = actions.createEl("button", { type: "button", text: t(lang, "taskCalendar.quickTaskCancel") });
    const confirm = actions.createEl("button", { cls: "mod-cta", type: "button", text: t(lang, "taskCalendar.quickTaskConfirm") });
    cancel.addEventListener("click", () => {
      this.quickTaskPreview = null;
      container.empty();
      input.focus();
    });
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      cancel.disabled = true;
      const taskText = [parsed.title, ...parsed.tags].filter(Boolean).join(" ");
      const options = this.quickTaskOptions(parsed, fallbackDate);
      void this.plugin.createTaskCalendarInboxTask(taskText, options.dueDate, options).then((created) => {
        if (!created) return;
        this.quickTaskDraft = "";
        this.quickTaskPreview = null;
        if (input.isConnected) input.value = "";
        if (container.isConnected) container.empty();
      }).finally(() => {
        if (confirm.isConnected) confirm.disabled = false;
        if (cancel.isConnected) cancel.disabled = false;
      });
    });
  }

  private quickTaskOptions(parsed: ParsedNaturalLanguageTask, fallbackDate: string): ProjectTaskOptions {
    const settings = this.plugin.settings;
    return {
      isTask: true,
      priority: parsed.priority === "none" ? settings.taskDefaultPriority : parsed.priority,
      projectTag: this.taskProject?.tag ?? "",
      dueDate: parsed.date || fallbackDate || settings.taskDefaultDueDate,
      dueTime: parsed.time,
      reminderMinutesBefore: parsed.reminderMinutesBefore,
      recurrence: settings.taskDefaultRecurrence,
      addCreatedDate: settings.taskAddCreatedDate,
      syncTarget: settings.appleSyncEnabled ? "reminders" : "tasks",
      syncTag: settings.appleSyncTag
    };
  }

  private renderTask(container: HTMLElement, task: TaskIndexItem, selectedDate: string): void {
    const item = container.createDiv({ cls: `memos-plus-task-calendar-task${task.completed ? " is-completed" : ""}`, attr: { draggable: "true" } });
    const title = task.title || t(this.plugin.settings.language, "taskCalendar.untitledTask");
    const checkbox = item.createEl("input", { cls: "memos-plus-task-calendar-task-checkbox", type: "checkbox", attr: { "aria-label": title } });
    checkbox.checked = task.completed;
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => this.toggleTaskCompletionOptimistically(task, checkbox, item));
    const body = item.createEl("button", {
      cls: "memos-plus-task-calendar-task-body",
      attr: {
        type: "button",
        title: `${t(this.plugin.settings.language, "taskCalendar.openSource")}: ${title}`,
        "aria-label": `${t(this.plugin.settings.language, "taskCalendar.openSource")}: ${title}`
      }
    });
    const heading = body.createDiv({ cls: "memos-plus-task-calendar-task-heading" });
    heading.createDiv({ cls: "memos-plus-task-calendar-task-title", text: title, attr: { title } });
    const date = task.dueDate || task.scheduledDate || task.startDate;
    const time = task.dueTime || task.startTime;
    const dateAndTime = [taskListDateLabel(date, this.plugin.settings.language), time].filter(Boolean).join(" ");
    const facts = body.createDiv({ cls: "memos-plus-task-calendar-task-meta memos-plus-task-calendar-task-facts" });
    if (date && date < selectedDate) facts.createSpan({ cls: "is-overdue", text: t(this.plugin.settings.language, "taskCalendar.overdue") });
    if (dateAndTime) facts.createSpan({ text: dateAndTime });
    const priority = priorityDetails(task.priority, this.plugin.settings.language);
    if (priority) facts.createSpan({ cls: task.priority === "highest" || task.priority === "high" ? "is-priority" : "", text: priority });
    const project = this.taskProjectLabel(task);
    if (project) facts.createSpan({ text: project });
    const syncStatus = this.taskAppleSyncStatus(task);
    if (syncStatus) {
      facts.createSpan({
        cls: `memos-plus-task-calendar-task-sync${syncStatus.error ? " is-error" : ""}`,
        text: syncStatus.label,
        attr: { title: syncStatus.title, "aria-label": syncStatus.title }
      });
    }
    const source = taskSourceLabel(task.filePath);
    if (source) body.createDiv({ cls: "memos-plus-task-calendar-task-source", text: `${this.plugin.settings.language === "zh" ? "来源" : "Source"}: ${source}`, attr: { title: task.filePath } });
    body.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.openTaskCalendarTask(task);
    });
    this.prepareTaskDrag(item, task);
    const settings = this.iconButton(item, "settings-2", t(this.plugin.settings.language, "taskCalendar.taskSettings"), () => this.selectTask(task));
    settings.addClass("memos-plus-task-calendar-task-settings");
  }

  private taskAppleSyncStatus(task: TaskIndexItem): { label: string; title: string; error: boolean } | null {
    const detail = this.taskAppleSyncDetail(task);
    if (!detail) return null;
    if (detail.error) return { ...detail, label: `⚠ ${t(this.plugin.settings.language, "taskCalendar.appleFailed")}` };
    return {
      ...detail,
      label: detail.label.startsWith("↻") ? "↻" : ""
    };
  }

  private taskProjectLabel(task: TaskIndexItem): string {
    const projectTag = taskCalendarTaskProjectTag(task.line, this.plugin.settings.projectTag);
    if (!projectTag) return "";
    const normalized = normalizeVisibleProjectTag(projectTag);
    return this.taskProjects.find((candidate) => normalizeVisibleProjectTag(candidate.tag ?? candidate.label) === normalized)?.label
      ?? normalized.replace(/^#/u, "").split("/").pop()
      ?? "";
  }

  private selectedTask(items: TaskIndexItem[]): TaskIndexItem | null {
    if (!this.selectedTaskKey) return null;
    const editing = this.taskEditSession?.getSnapshot().task;
    if (editing && taskCalendarTaskKey(editing) === this.selectedTaskKey) return editing;
    return items.find((item) => taskCalendarTaskKey(item) === this.selectedTaskKey) ?? null;
  }

  private selectTask(task: TaskIndexItem): void {
    if (this.selectedTaskKey && this.selectedTaskKey !== taskCalendarTaskKey(task)) this.releaseTaskEditSession();
    this.selectedTaskKey = taskCalendarTaskKey(task);
    if (!Platform.isMobile && this.plugin.settings.taskCalendar.tasksPaneHidden) {
      void this.updateState({ tasksPaneHidden: false });
      return;
    }
    if (Platform.isMobile && this.plugin.settings.taskCalendar.mobileTab !== "tasks") {
      void this.updateState({ mobileTab: "tasks" });
      return;
    }
    this.renderForced();
  }

  private prepareTaskDrag(element: HTMLElement, task: TaskIndexItem): void {
    element.addEventListener("dragstart", (event) => {
      this.draggingTask = task;
      element.addClass("is-dragging");
      event.dataTransfer?.setData("text/plain", taskCalendarTaskKey(task));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    element.addEventListener("dragend", () => {
      this.draggingTask = null;
      element.removeClass("is-dragging");
      this.contentEl.querySelectorAll(".is-task-drop-target").forEach((target) => target.removeClass("is-task-drop-target"));
    });
  }

  private toggleTaskCompletionOptimistically(task: TaskIndexItem, checkbox: HTMLInputElement, host: HTMLElement): void {
    const desired = checkbox.checked;
    host.querySelector(".memos-plus-task-calendar-inline-retry")?.remove();
    host.toggleClass("is-completed", desired);
    host.addClass("is-saving");
    const persist = (): void => {
      void this.plugin.toggleTaskCalendarTask(task).then((saved) => {
        host.removeClass("is-saving");
        if (saved || !host.isConnected) return;
        checkbox.checked = desired;
        const retry = host.createEl("button", {
          cls: "memos-plus-task-calendar-inline-retry",
          type: "button",
          text: t(this.plugin.settings.language, "taskCalendar.saveFailedRetry")
        });
        retry.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          retry.remove();
          persist();
        });
      });
    };
    persist();
  }

  private async updateTask(task: TaskIndexItem, patch: TaskCalendarTaskPatch): Promise<boolean> {
    const updated = await this.plugin.updateTaskCalendarTask(task, patch);
    if (updated) {
      this.selectedTaskKey = taskCalendarTaskKey(task);
      this.renderForced();
    }
    return updated;
  }

  private renderTaskDetails(container: HTMLElement, task: TaskIndexItem): void {
    const lang = this.plugin.settings.language;
    const session = this.getTaskEditSession(task);
    task = session.getSnapshot().task;
    const detail = parseTaskCalendarDetailMetadata(task.line);
    const form = container.createDiv({ cls: "memos-plus-task-calendar-task-details" });
    const toolbar = form.createDiv({ cls: "memos-plus-task-calendar-task-detail-toolbar" });
    const back = this.iconButton(toolbar, "arrow-left", t(lang, "taskCalendar.backToTasks"), () => {
      this.releaseTaskEditSession();
      this.selectedTaskKey = "";
      this.renderForced();
    });
    back.addClass("memos-plus-task-calendar-task-detail-back");
    toolbar.createDiv({ cls: "memos-plus-task-calendar-task-detail-path", text: task.filePath });
    const status = toolbar.createSpan({ cls: "memos-plus-task-calendar-task-detail-sync" });
    const retry = toolbar.createEl("button", { cls: "memos-plus-task-calendar-task-detail-retry", type: "button", text: t(lang, "taskCalendar.retry") });
    retry.addEventListener("click", () => session.retry());
    session.setListener((snapshot) => this.updateTaskEditStatus(status, retry, snapshot));

    const title = taskDetailTextField(form, t(lang, "taskCalendar.detail.title"), task.title);
    const row = form.createDiv({ cls: "memos-plus-task-calendar-task-detail-grid" });
    const date = taskDetailInput(row, t(lang, "taskCalendar.detail.date"), "date", taskDate(task));
    const time = taskDetailInput(row, t(lang, "taskCalendar.detail.time"), "time", task.dueTime || task.startTime);
    const reminderDate = taskDetailInput(row, t(lang, "taskCalendar.detail.reminderDate"), "date", task.reminderDate);
    const reminderTime = taskDetailInput(row, t(lang, "taskCalendar.detail.reminderTime"), "time", task.reminderTime);
    const reminderLead = taskDetailInput(row, t(lang, "taskCalendar.detail.reminderLead"), "number", task.reminderMinutesBefore === undefined ? "" : String(task.reminderMinutesBefore));
    reminderLead.min = "0";
    reminderLead.max = "10080";

    const priority = taskDetailSelect(form, t(lang, "taskCalendar.detail.priority"), [
      ["none", t(lang, "taskPriority.none")],
      ["highest", t(lang, "taskPriority.highest")],
      ["high", t(lang, "taskPriority.high")],
      ["medium", t(lang, "taskPriority.medium")],
      ["low", t(lang, "taskPriority.low")],
      ["lowest", t(lang, "taskPriority.lowest")]
    ], task.priority);
    const currentRecurrence = taskCalendarTaskRecurrence(task.line);
    const recurrence = taskDetailSelect(form, t(lang, "taskCalendar.detail.recurrence"), [
      ["none", t(lang, "taskRecurrence.none")],
      ["daily", t(lang, "taskRecurrence.daily")],
      ["weekdays", t(lang, "taskRecurrence.weekdays")],
      ["weekly", t(lang, "taskRecurrence.weekly")],
      ["monthly", t(lang, "taskRecurrence.monthly")],
      ["yearly", t(lang, "taskRecurrence.yearly")],
      ["custom", t(lang, "taskRecurrence.custom")]
    ], currentRecurrence.recurrence);
    const customRecurrence = taskDetailTextField(form, t(lang, "taskCalendar.detail.customRecurrence"), currentRecurrence.customRecurrence);
    customRecurrence.closest<HTMLElement>(".memos-plus-task-calendar-task-detail-field")?.toggleClass("is-hidden", recurrence.value !== "custom");

    const currentProject = taskCalendarTaskProjectTag(task.line, this.plugin.settings.projectTag);
    const projectOptions: Array<[string, string]> = [["", t(lang, "taskCalendar.noProject")]];
    for (const candidate of this.taskProjects) projectOptions.push([normalizeVisibleProjectTag(candidate.tag ?? candidate.label), candidate.label]);
    if (currentProject && !projectOptions.some(([value]) => value === currentProject)) projectOptions.push([currentProject, currentProject]);
    const project = taskDetailSelect(form, t(lang, "taskCalendar.detail.project"), projectOptions, currentProject);
    const tags = taskDetailTextField(form, t(lang, "taskCalendar.detail.tags"), taskCalendarTaskTags(task.line, {
      projectTagPrefix: this.plugin.settings.projectTag,
      appleSyncTag: this.plugin.settings.appleSyncTag
    }).join(" "));
    const notes = taskDetailTextarea(form, t(lang, "taskCalendar.detail.notes"), detail.notes ?? "");
    const related = taskDetailTextField(form, t(lang, "taskCalendar.detail.relatedNote"), detail.relatedNote ?? "");

    title.addEventListener("input", () => session.apply({ title: title.value }, 260));
    date.addEventListener("change", () => session.apply({ date: date.value }));
    time.addEventListener("change", () => session.apply({ time: time.value }));
    reminderDate.addEventListener("change", () => session.apply({ reminderDate: reminderDate.value }));
    reminderTime.addEventListener("change", () => session.apply({ reminderTime: reminderTime.value }));
    reminderLead.addEventListener("input", () => {
      const lead = reminderLead.value.trim() ? Math.max(0, Math.min(10080, Math.round(Number(reminderLead.value)))) : undefined;
      session.apply({ reminderMinutesBefore: reminderLead.value.trim() && Number.isFinite(lead) ? lead : null }, 180);
    });
    priority.addEventListener("change", () => session.apply({ priority: priority.value as TaskPriorityFilterValue }));
    recurrence.addEventListener("change", () => {
      customRecurrence.closest<HTMLElement>(".memos-plus-task-calendar-task-detail-field")?.toggleClass("is-hidden", recurrence.value !== "custom");
      session.apply({ recurrence: recurrence.value as TaskRecurrence, customRecurrence: customRecurrence.value });
    });
    customRecurrence.addEventListener("input", () => session.apply({ recurrence: "custom", customRecurrence: customRecurrence.value }, 220));
    project.addEventListener("change", () => session.apply({ projectTag: project.value }));
    tags.addEventListener("input", () => session.apply({ tags: tags.value.split(/[\s,，]+/u).filter(Boolean) }, 220));
    notes.addEventListener("input", () => session.apply({ notes: notes.value }, 320));
    related.addEventListener("input", () => session.apply({ relatedNote: related.value }, 260));

    const postpone = form.createDiv({ cls: "memos-plus-task-calendar-postpone" });
    postpone.createSpan({ text: t(lang, "taskCalendar.postpone") });
    for (const [kind, label] of [["today", "taskCalendar.postpone.today"], ["tomorrow", "taskCalendar.postpone.tomorrow"], ["next-week", "taskCalendar.postpone.nextWeek"]] as const) {
      const button = postpone.createEl("button", { type: "button", text: t(lang, label) });
      button.addEventListener("click", () => {
        const value = taskCalendarPostponeDate(kind);
        date.value = value;
        session.apply({ date: value });
      });
    }
    const choose = postpone.createEl("button", { type: "button", text: t(lang, "taskCalendar.postpone.choose") });
    choose.addEventListener("click", () => {
      date.focus();
      if ("showPicker" in date) date.showPicker();
    });

    const actions = form.createDiv({ cls: "memos-plus-task-calendar-task-detail-actions" });
    const open = actions.createEl("button", { type: "button", text: t(lang, "taskCalendar.openSource") });
    open.addEventListener("click", () => void this.plugin.openTaskCalendarTask(task));
    if (this.plugin.canEditTaskCalendarTask()) {
      const tasksEdit = actions.createEl("button", { type: "button", text: t(lang, "taskCalendar.tasksEdit") });
      tasksEdit.addEventListener("click", () => void this.plugin.editTaskCalendarTask(task));
    }
    const save = actions.createEl("button", { cls: "mod-cta", type: "button", text: t(lang, "common.save") });
    save.addEventListener("click", () => session.flushNow());
  }

  private getTaskEditSession(task: TaskIndexItem): TaskCalendarEditSession {
    if (this.taskEditSession && taskCalendarTaskKey(this.taskEditSession.getSnapshot().task) === taskCalendarTaskKey(task)) {
      return this.taskEditSession;
    }
    this.releaseTaskEditSession();
    this.taskEditSession = new TaskCalendarEditSession({
      task,
      context: {
        projectTagPrefix: this.plugin.settings.projectTag,
        appleSyncTag: this.plugin.settings.appleSyncTag
      },
      persist: (sourceTask, patch) => this.plugin.updateTaskCalendarTask(sourceTask, patch, false),
      shouldSync: (currentTask) => this.shouldSyncEditedTask(currentTask),
      sync: () => this.plugin.syncAppleNow(false)
    });
    return this.taskEditSession;
  }

  private releaseTaskEditSession(): void {
    if (!this.taskEditSession) return;
    this.taskEditSession.setListener(null);
    this.taskEditSession.flushNow();
    this.taskEditSession = null;
  }

  private handleTaskIndexChange(): void {
    if (this.taskEditSession && this.selectedTaskKey) {
      const indexed = this.plugin.taskIndex.getItems().find((item) => taskCalendarTaskKey(item) === this.selectedTaskKey);
      if (indexed) this.taskEditSession.reconcile(indexed);
      if (this.contentEl.querySelector(".memos-plus-task-calendar-task-details")) return;
    }
    this.scheduleRender();
  }

  private shouldSyncEditedTask(task: TaskIndexItem): boolean {
    if (!this.plugin.settings.appleSyncEnabled) return false;
    if (task.syncTarget === "calendar" || task.syncTarget === "reminders" || task.appleSyncTagged) return true;
    return taskLineContainsTag(task.line, this.plugin.settings.appleSyncTag.replace(/^#+/u, ""));
  }

  private updateTaskEditStatus(status: HTMLElement, retry: HTMLButtonElement, snapshot: TaskCalendarEditSnapshot): void {
    const lang = this.plugin.settings.language;
    status.removeClass("is-error", "is-saving", "is-modified");
    retry.toggle(snapshot.canRetry);
    if (snapshot.saveState === "save-failed") {
      status.addClass("is-error");
      status.setText(t(lang, "taskCalendar.saveFailed"));
      status.setAttr("title", snapshot.saveError);
      return;
    }
    status.removeAttribute("title");
    if (snapshot.saveState === "modified") {
      status.addClass("is-modified");
      status.setText(t(lang, "taskCalendar.modified"));
      return;
    }
    if (snapshot.saveState === "saving") {
      status.addClass("is-saving");
      status.setText(t(lang, "taskCalendar.saving"));
      return;
    }
    if (snapshot.syncState === "syncing") {
      status.addClass("is-saving");
      status.setText(t(lang, "taskCalendar.syncing"));
      return;
    }
    if (snapshot.syncState === "sync-failed") {
      status.addClass("is-error");
      status.setText(t(lang, "taskCalendar.appleFailed"));
      return;
    }
    if (snapshot.syncState === "synced") {
      status.setText(t(lang, "taskCalendar.appleSynced"));
      return;
    }
    const apple = this.taskAppleSyncDetail(snapshot.task);
    status.setText(apple?.label ?? t(lang, "taskCalendar.saved"));
    status.toggleClass("is-error", apple?.error === true);
    if (apple?.title) status.setAttr("title", apple.title);
  }

  private taskAppleSyncDetail(task: TaskIndexItem): { label: string; title: string; error: boolean } | null {
    const target = task.syncTarget || (task.appleSyncTagged || task.appleSyncId ? "reminders" : "");
    if (!target) return null;
    const targetLabel = t(this.plugin.settings.language, target === "calendar" ? "taskCalendar.appleCalendar" : "taskCalendar.appleReminders");
    const recordKey = task.appleSyncId ? `${target}:${task.appleSyncId}` : "";
    const pending = Boolean(recordKey && this.plugin.settings.appleSyncState.pending[recordKey]);
    const synced = Boolean(recordKey && this.plugin.settings.appleSyncState.records[recordKey]);
    const error = this.plugin.settings.appleSyncState.lastError;
    if (pending) return {
      label: `↻ ${t(this.plugin.settings.language, "taskCalendar.applePending")}`,
      title: t(this.plugin.settings.language, "taskCalendar.applePending"),
      error: false
    };
    if (error) return { label: `⚠ ${t(this.plugin.settings.language, "taskCalendar.appleFailed")}`, title: error, error: true };
    return {
      label: synced ? `✓ ${targetLabel}` : `↻ ${t(this.plugin.settings.language, "taskCalendar.applePending")}`,
      title: synced ? t(this.plugin.settings.language, "taskCalendar.appleSynced") : t(this.plugin.settings.language, "taskCalendar.applePending"),
      error: false
    };
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
    this.renderForced();
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
    if (navigation === "upcoming") {
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
    this.renderForced();
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

function priorityDetails(priority: TaskIndexItem["priority"], lang: "zh" | "en"): string {
  const icon = ({ highest: "🔺", high: "⏫", medium: "🔼", low: "🔽", lowest: "⏬", none: "" } as const)[priority] || "";
  const labelKey = ({
    highest: "taskPriority.highest",
    high: "taskPriority.high",
    medium: "taskPriority.medium",
    low: "taskPriority.low",
    lowest: "taskPriority.lowest",
    none: "taskPriority.none"
  } as const)[priority];
  return icon ? `${icon} ${t(lang, labelKey)}` : "";
}

function taskSourceLabel(filePath: string): string {
  return filePath.split("/").pop()?.replace(/\.md$/iu, "") ?? filePath;
}

function taskListDateLabel(date: string, lang: "zh" | "en"): string {
  if (!date) return "";
  const today = todayTaskCalendarDate();
  if (date === today) return lang === "zh" ? "今天" : "Today";
  if (date === shiftDate(today, "day", 1)) return lang === "zh" ? "明天" : "Tomorrow";
  return date;
}

function summaryCard(container: HTMLElement, label: string, value: string, extraClass = ""): void {
  const card = container.createDiv({ cls: `memos-plus-task-calendar-summary-card${extraClass ? ` ${extraClass}` : ""}` });
  card.createSpan({ cls: "memos-plus-task-calendar-summary-label", text: label });
  card.createEl("strong", { text: value });
}

function nextScheduleLabel(tasks: TaskIndexItem[], events: AppleCalendarAgendaEvent[], date: string): string {
  const now = new Date();
  const nowMinutes = calendarEventLocalDate(now.toISOString()) === date ? now.getHours() * 60 + now.getMinutes() : -1;
  const candidates: Array<{ minutes: number; label: string }> = [];
  for (const task of tasks) {
    const time = task.dueTime || task.startTime;
    const minutes = minutesFromTime(time);
    if (minutes >= nowMinutes) candidates.push({ minutes, label: `${time} ${task.title}`.trim() });
  }
  for (const event of events) {
    const time = event.allDay ? "" : timePart(event.start);
    const minutes = event.allDay ? 0 : minutesFromTime(time);
    if (minutes >= nowMinutes) candidates.push({ minutes, label: `${time || "全天"} ${event.title}`.trim() });
  }
  return candidates.sort((left, right) => left.minutes - right.minutes)[0]?.label ?? "";
}

function minutesFromTime(value: string): number {
  const match = value.match(/^(\d{1,2}):(\d{2})$/u);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 24 * 60;
}

function taskDetailField(container: HTMLElement, label: string): HTMLElement {
  const field = container.createEl("label", { cls: "memos-plus-task-calendar-task-detail-field" });
  field.createSpan({ text: label });
  return field;
}

function taskDetailInput(container: HTMLElement, label: string, type: string, value: string): HTMLInputElement {
  const input = taskDetailField(container, label).createEl("input", { attr: { type } });
  input.value = value;
  return input;
}

function taskDetailTextField(container: HTMLElement, label: string, value: string): HTMLInputElement {
  return taskDetailInput(container, label, "text", value);
}

function taskDetailTextarea(container: HTMLElement, label: string, value: string): HTMLTextAreaElement {
  const textarea = taskDetailField(container, label).createEl("textarea");
  textarea.value = value;
  textarea.rows = 3;
  return textarea;
}

function taskDetailSelect(container: HTMLElement, label: string, options: Array<[string, string]>, value: string): HTMLSelectElement {
  const select = taskDetailField(container, label).createEl("select");
  for (const [optionValue, optionLabel] of options) {
    const option = select.createEl("option", { value: optionValue, text: optionLabel });
    option.selected = optionValue === value;
  }
  return select;
}

function normalizeVisibleProjectTag(value: string): string {
  const normalized = value.trim().replace(/^#+/u, "");
  return normalized ? `#${normalized}` : "";
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
