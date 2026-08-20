import { Notice, Platform, Plugin, TFile, WorkspaceLeaf, normalizePath, requestUrl, setIcon, type Editor, type ObsidianProtocolData } from "obsidian";
import { MemosPlusSettingTab, MemosPlusSettings, normalizeSettings } from "./src/settings";
import { MemosPlusStore } from "./src/store";
import { QuickCaptureModal } from "./src/modal";
import { MEMOS_PLUS_VIEW_TYPE, MemosPlusView } from "./src/view";
import { MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE, MemosPlusQuickInputView, shouldUseQuickInputModalFallback } from "./src/quickInputView";
import { MEMOS_PLUS_MOBILE_PANEL_VIEW_TYPE, MemosPlusMobilePanelView } from "./src/mobilePanelView";
import { t } from "./src/i18n";
import { MemosPlusLinkSuggest, MemosPlusTagSuggest } from "./src/editorSuggest";
import { captureClipboardLinkToMemos } from "./src/linkCaptureActions";
import { fetchPageTitle, resolveClipboardMarkdownLink } from "./src/linkCapture";
import type { QuickCaptureInitialContentMode } from "./src/quickCaptureContent";
import { TaskIndex } from "./src/taskIndex";
import type { TaskIndexItem } from "./src/taskIndex";
import { editIndexedTaskWithTasksApi, getTasksApi, toggleIndexedTask, updateIndexedTaskFromCalendar } from "./src/taskActions";
import type { TaskCalendarTaskPatch } from "./src/taskCalendarTaskEditor";
import { openIndexedTask } from "./src/taskNavigation";
import { confirmWithModal } from "./src/confirmModal";
import { importClipboardImageWithConfirmation } from "./src/clipboardImageImport";
import { readClipboardImageSafely } from "./src/quickCaptureContent";
import { VaultMetadataIndex } from "./src/vaultIndex";
import { viewLayoutsNeedData, type ViewLayoutsSettings } from "./src/displayModules";
import type { ProjectSendChoice, ProjectSendModalOptions } from "./src/projectFileSuggestModal";
import {
  configureMemosPlusDiagnostics,
  createMemosPlusSessionId,
  exportMemosPlusDiagnosticLog,
  logMemosPlusDiagnostic,
  registerMemosPlusDiagnostics,
  setMemosPlusDiagnosticState
} from "./src/diagnostics";
import { SerialTaskQueue } from "./src/serialTaskQueue";
import { MacOsAppleSyncBridge } from "./src/appleSyncBridge";
import { AppleSyncService } from "./src/appleSyncService";
import { MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE, TaskCalendarView } from "./src/taskCalendarView";
import {
  taskCalendarOpenOptionsForOrganizer,
  todayTaskCalendarDate,
  type TaskCalendarOpenOptions
} from "./src/taskCalendar";
import type { OrganizerFilterId } from "./src/organizerPanel";
import { openTaskOptionsModal, renderTaskContentWithOptions } from "./src/taskOptionsModal";
import { normalizeAppleSyncTag } from "./src/appleSync";
import type { ProjectTaskOptions } from "./src/tasksFormat";
import { taskAtEditorCursor } from "./src/currentTaskEditor";
import { TaskCalendarEditSession } from "./src/taskCalendarEditSession";
import { openTaskCalendarTaskEditorModal } from "./src/taskCalendarTaskEditorModal";
import { QuickTaskPanel } from "./src/quickTaskPanel";
import { deliverContentToProjectChoice } from "./src/projectDelivery";
import { openUnifiedTaskComposer, type OpenUnifiedTaskComposerOptions } from "./src/unifiedTaskComposer";
import { LearningCardService } from "./src/learning/learningCardService";
import { LearningReviewModal } from "./src/learning/learningReviewModal";
import { createTaskMetadataEditorExtension } from "./src/taskMetadataEditor";
import type { WorkbenchDirectoryOptions } from "./src/workbenchNavigation";

const LINK_ANALYSIS_TITLE_CACHE_LIMIT = 100;

export default class MemosPlusPlugin extends Plugin {
  settings: MemosPlusSettings = normalizeSettings({});
  store!: MemosPlusStore;
  vaultIndex!: VaultMetadataIndex;
  taskIndex!: TaskIndex;
  appleSync!: AppleSyncService;
  learningCards!: LearningCardService;
  private taskCalendarRibbonEl: HTMLElement | null = null;
  private quickTaskPanel: QuickTaskPanel | null = null;
  private diagnosticSessionId = "";
  private taskIndexRefreshTimer: number | null = null;
  private vaultIndexWarmTimer: number | null = null;
  private appleSyncRetryTimer: number | null = null;
  private appleSyncRetryAttempt = 0;
  private readonly settingsSaveQueue = new SerialTaskQueue();
  private readonly linkAnalysisTitleCache = new Map<string, Promise<string>>();

  async onload(): Promise<void> {
    this.diagnosticSessionId = createMemosPlusSessionId();
    configureMemosPlusDiagnostics({
      enabled: Platform.isMobile,
      persistent: false,
      sessionId: this.diagnosticSessionId,
      version: this.manifest.version
    });
    logMemosPlusDiagnostic("memos-plus:onload", { phase: "start" });
    logMemosPlusDiagnostic("data:load", { phase: "start" });
    let savedSettings: unknown;
    try {
      savedSettings = await this.loadData();
      logMemosPlusDiagnostic("data:load", {
        phase: "end",
        hasData: Boolean(savedSettings)
      });
    } catch (error) {
      logMemosPlusDiagnostic("data:load", {
        phase: "error",
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
      throw error;
    }
    this.settings = normalizeSettings(savedSettings);
    configureMemosPlusDiagnostics({
      enabled: Platform.isMobile || this.settings.performanceDebugMode,
      persistent: this.settings.performanceDebugMode,
      sessionId: this.diagnosticSessionId,
      version: this.manifest.version
    });
    logMemosPlusDiagnostic("memos-plus:onload", {
      phase: "settings-loaded",
      quickInputEnabled: this.settings.quickInputEnabled,
      quickInputAutoOpen: this.settings.quickInputAutoOpen
    });
    this.vaultIndex = new VaultMetadataIndex(this.app);
    this.taskIndex = new TaskIndex(this.app, { isMobile: () => Platform.isMobile });
    this.store = new MemosPlusStore(this.app, () => this.settings, this.vaultIndex);
    this.learningCards = new LearningCardService(
      this.app,
      () => this.settings.learningCards,
      async (cards) => {
        this.settings.learningCards = cards;
        await this.persistSettings();
        this.scheduleRefreshViews("learning-card-change", Platform.isMobile ? 250 : 80);
      }
    );
    this.appleSync = new AppleSyncService({
      app: this.app,
      taskIndex: this.taskIndex,
      bridge: new MacOsAppleSyncBridge(),
      getSettings: () => this.settings,
      persistSettings: () => this.persistSettings()
    });
    registerMemosPlusDiagnostics(this, this.app);
    this.registerVaultIndexInvalidation();
    this.registerTaskIndexInvalidation();
    this.register(
      this.taskIndex.onChange(() => {
        const status = this.taskIndex.getStatus();
        if (
          Platform.isMobile &&
          this.settings.taskIndexDelayOnMobile &&
          status.cacheState !== "normal"
        ) {
          return;
        }
        this.scheduleRefreshViews("task-index-change", Platform.isMobile ? 750 : 200);
      })
    );

    this.registerView(MEMOS_PLUS_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusView(leaf, this));
    this.registerView(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusQuickInputView(leaf, this));
    this.registerView(MEMOS_PLUS_MOBILE_PANEL_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusMobilePanelView(leaf, this));
    this.registerView(MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE, (leaf: WorkspaceLeaf) => new TaskCalendarView(leaf, this));
    this.registerEditorSuggest(new MemosPlusTagSuggest(this.app));
    this.registerEditorSuggest(new MemosPlusLinkSuggest(this.app));
    this.registerEditorExtension(createTaskMetadataEditorExtension(this));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      const task = taskAtEditorCursor(editor, info.file);
      if (!task) return;
      menu.addItem((item) => item
        .setTitle(t(this.settings.language, "taskCalendar.editTask"))
        .setIcon("settings-2")
        .onClick(() => this.runAsyncOperation("edit task from editor menu", () => this.openTaskCalendarTaskEditor(task))));
    }));

    this.addRibbonIcon("message-square-plus", t(this.settings.language, "command.open"), () => {
      this.runAsyncOperation("activate view from ribbon", () => this.activateView());
    });
    this.registerTaskManagerStatusBarItem();
    this.updateTaskCalendarRibbon(this.settings.taskCalendar.showRibbon);

    this.addCommand({
      id: "open",
      name: t(this.settings.language, "command.open"),
      callback: () => {
        this.runAsyncOperation("activate view", () => this.activateView());
      }
    });

    this.addCommand({
      id: "quick-capture",
      name: t(this.settings.language, "command.quickCapture"),
      callback: () => {
        this.openQuickCaptureWithContentSource("auto");
      }
    });

    this.addCommand({
      id: "open-task-manager",
      name: t(this.settings.language, "taskManager.open"),
      callback: () => this.runAsyncOperation("open all tasks", () => this.openTaskCalendar({ navigation: "all" }))
    });

    this.addCommand({
      id: "open-task-calendar",
      name: t(this.settings.language, "command.openTaskCalendar"),
      callback: () => this.runAsyncOperation("open task calendar", () => this.openTaskCalendar())
    });

    this.addCommand({
      id: "open-task-calendar-today",
      name: t(this.settings.language, "command.openTaskCalendarToday"),
      callback: () => this.runAsyncOperation("open task calendar today", () => this.openTaskCalendar({ navigation: "today", selectedDate: todayTaskCalendarDate(), viewMode: "day" }))
    });

    this.addCommand({
      id: "quick-add-task",
      name: t(this.settings.language, "command.quickAddTask"),
      callback: () => this.runAsyncOperation("focus task calendar quick task", () => this.openTaskCalendar({ focusQuickTask: true }))
    });

    this.addCommand({
      id: "edit-current-task",
      name: t(this.settings.language, "command.editCurrentTask"),
      editorCallback: (editor, view) => {
        this.runAsyncOperation("edit current Markdown task", () => this.openCurrentTaskEditor(editor, view.file));
      }
    });

    this.addCommand({
      id: "quick-add-calendar-event",
      name: t(this.settings.language, "command.quickAddCalendarEvent"),
      callback: () => this.runAsyncOperation("open calendar event composer", async () => {
        const leaf = await this.activateTaskCalendarView();
        if (leaf?.view instanceof TaskCalendarView) leaf.view.openEventComposer();
      })
    });

    this.addCommand({
      id: "open-task-calendar-inbox",
      name: t(this.settings.language, "command.openTaskCalendarInbox"),
      callback: () => this.runAsyncOperation("open task calendar inbox", () => this.openTaskCalendar({ navigation: "inbox", focusQuickTask: true }))
    });

    this.addCommand({
      id: "sync-apple-now",
      name: t(this.settings.language, "command.appleSyncNow"),
      callback: () => {
        this.runAsyncOperation("sync Apple apps", () => this.syncAppleNow());
      }
    });

    this.addCommand({
      id: "test-apple-sync",
      name: t(this.settings.language, "command.appleSyncTest"),
      callback: () => {
        this.runAsyncOperation("test Apple sync", () => this.testAppleSyncConnection());
      }
    });

    this.addCommand({
      id: "quick-capture-clipboard",
      name: t(this.settings.language, "command.quickCaptureClipboard"),
      callback: () => {
        this.openQuickCaptureWithContentSource("clipboard", true);
      }
    });

    this.addCommand({
      id: "import-clipboard-image",
      name: t(this.settings.language, "command.importClipboardImage"),
      callback: () => {
        this.runAsyncOperation("import clipboard image", () => this.importClipboardImage());
      }
    });

    this.addCommand({
      id: "open-quick-input-sidebar",
      name: t(this.settings.language, "command.openQuickInputSidebar"),
      callback: () => {
        this.runAsyncOperation("activate quick input", () => this.activateQuickInputView());
      }
    });

    this.addCommand({
      id: "capture-clipboard-link-to-memos",
      name: t(this.settings.language, "command.linkCaptureDefault"),
      callback: () => {
        this.runAsyncOperation("capture clipboard link", () => this.captureClipboardLinkToMemos());
      }
    });

    this.addCommand({
      id: "focus-composer",
      name: t(this.settings.language, "command.focusComposer"),
      callback: () => {
        this.runAsyncOperation("focus composer", async () => {
          const leaf = await this.activateView();
          if (leaf?.view instanceof MemosPlusView) {
            leaf.view.focusComposer();
          }
        });
      }
    });

    this.addCommand({
      id: "export-diagnostic-log",
      name: t(this.settings.language, "command.exportDiagnosticLog"),
      callback: () => {
        this.runAsyncOperation("export diagnostic log", () => this.exportDiagnosticLog());
      }
    });

    this.registerObsidianProtocolHandler("memos-plus", (params) => {
      this.handleMemosPlusProtocol(params);
    });

    this.addSettingTab(new MemosPlusSettingTab(this.app, this));
    this.maybeBuildTaskIndexAfterLoad();
    this.maybeWarmVaultIndexAfterLoad();
    this.registerAppleSyncSchedule();
    if (this.settings.quickInputEnabled && this.settings.quickInputAutoOpen) {
      this.app.workspace.onLayoutReady(() => {
        this.runAsyncOperation("auto open quick input", () => this.activateQuickInputView({ focusComposer: false, useModalFallback: false }));
      });
    }
  }

  onunload(): void {
    this.quickTaskPanel?.destroy();
    this.quickTaskPanel = null;
    this.clearTaskIndexRefreshTimer();
    this.clearVaultIndexWarmTimer();
    this.clearAppleSyncRetry();
    logMemosPlusDiagnostic("memos-plus:onunload", {
      memosLeaves: this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE).length,
      quickInputLeaves: this.app.workspace.getLeavesOfType(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE).length
    });
  }

  async activateView(preferredLeaf?: WorkspaceLeaf): Promise<WorkspaceLeaf | null> {
    const existing = preferredLeaf?.view.getViewType() === MEMOS_PLUS_VIEW_TYPE
      ? preferredLeaf
      // A workbench navigation click must keep the current tab even if the
      // user also has another Memos Plus tab open elsewhere in the workspace.
      : preferredLeaf ? null : this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return existing;
    }

    const leaf = preferredLeaf ?? this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MEMOS_PLUS_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async activateTaskCalendarView(preferredLeaf?: WorkspaceLeaf): Promise<WorkspaceLeaf | null> {
    const existing = preferredLeaf?.view.getViewType() === MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE
      ? preferredLeaf
      // See activateView: explicit in-workbench navigation owns its leaf.
      : preferredLeaf ? null : this.app.workspace.getLeavesOfType(MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return existing;
    }
    const leaf = preferredLeaf ?? this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async openTaskCalendar(options?: TaskCalendarOpenOptions, preferredLeaf?: WorkspaceLeaf): Promise<void> {
    const leaf = await this.activateTaskCalendarView(preferredLeaf);
    if (!(leaf?.view instanceof TaskCalendarView)) return;
    if (options) leaf.view.applyOpenOptions(options);
    else leaf.view.openDefault();
  }

  async openTaskCalendarFromOrganizer(filterId: OrganizerFilterId, preferredLeaf?: WorkspaceLeaf): Promise<void> {
    const options = taskCalendarOpenOptionsForOrganizer(filterId);
    if (options) await this.openTaskCalendar(options, preferredLeaf);
  }

  /**
   * Directory, task planning and learning intentionally share one workspace
   * leaf.  Switching back to memos therefore replaces the current workbench
   * surface instead of opening another sidebar or tab.
   */
  async openWorkbenchDirectory(options: WorkbenchDirectoryOptions = {}, preferredLeaf?: WorkspaceLeaf): Promise<void> {
    const leaf = await this.activateView(preferredLeaf);
    if (leaf?.view instanceof MemosPlusView) {
      await leaf.view.applyWorkbenchDirectoryOptions(options);
    }
  }

  async activateQuickInputView(options: { focusComposer?: boolean; useModalFallback?: boolean } = {}): Promise<WorkspaceLeaf | null> {
    if (!this.settings.quickInputEnabled) {
      new Notice(t(this.settings.language, "notice.quickInputDisabled"));
      return null;
    }
    const focusComposer = options.focusComposer ?? true;
    const useModalFallback = options.useModalFallback ?? true;
    if (shouldUseQuickInputModalFallback() && useModalFallback) {
      new QuickCaptureModal(this.app, {
        settings: this.settings,
        store: this.store,
        persistSettings: () => this.persistSettings(),
        refreshViews: () => this.refreshViews(),
        resolveMarkdownLink: (text) => this.resolveMarkdownLink(text),
        selectProjectTargetOnMobile: (options) => this.selectProjectTargetOnMobile(options),
        onTaskWritten: (file, task) => this.onUnifiedTaskWritten(file, task),
        onContentWritten: (file, content, heading) => this.onContentWritten(file, content, heading)
      }).open();
      return null;
    }
    const existing = this.app.workspace.getLeavesOfType(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      if (focusComposer && existing.view instanceof MemosPlusQuickInputView) {
        existing.view.focusComposer();
      }
      return existing;
    }
    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (focusComposer && leaf.view instanceof MemosPlusQuickInputView) {
      leaf.view.focusComposer();
    }
    return leaf;
  }

  async selectProjectTargetOnMobile(options: ProjectSendModalOptions): Promise<ProjectSendChoice | null> {
    const existing = this.app.workspace.getLeavesOfType(MEMOS_PLUS_MOBILE_PANEL_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: MEMOS_PLUS_MOBILE_PANEL_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    if (leaf.view instanceof MemosPlusMobilePanelView) {
      const choice = leaf.view.startProjectSend(options);
      await leaf.view.prepareForImmediateInteraction();
      return choice;
    }
    return null;
  }

  private openQuickCaptureWithContentSource(initialContentMode: QuickCaptureInitialContentMode, showClipboardEmptyNotice = false): void {
    new QuickCaptureModal(this.app, {
      settings: this.settings,
      store: this.store,
      persistSettings: () => this.persistSettings(),
      refreshViews: () => this.refreshViews(),
      initialContentMode,
      showClipboardEmptyNotice,
      resolveMarkdownLink: (text) => this.resolveMarkdownLink(text),
      selectProjectTargetOnMobile: (options) => this.selectProjectTargetOnMobile(options),
      onTaskWritten: (file, task) => this.onUnifiedTaskWritten(file, task),
      onContentWritten: (file, content, heading) => this.onContentWritten(file, content, heading)
    }).open();
  }

  private openQuickCaptureWithInitialContent(initialContent: string): void {
    new QuickCaptureModal(this.app, {
      settings: this.settings,
      store: this.store,
      persistSettings: () => this.persistSettings(),
      refreshViews: () => this.refreshViews(),
      initialContent,
      initialContentMode: "none",
      resolveMarkdownLink: (text) => this.resolveMarkdownLink(text),
      selectProjectTargetOnMobile: (options) => this.selectProjectTargetOnMobile(options),
      onTaskWritten: (file, task) => this.onUnifiedTaskWritten(file, task),
      onContentWritten: (file, content, heading) => this.onContentWritten(file, content, heading)
    }).open();
  }

  private async importClipboardImage(): Promise<void> {
    const lang = this.settings.language;
    const result = await importClipboardImageWithConfirmation({
      confirmImport: () =>
        confirmWithModal(this.app, {
          language: lang,
          title: t(lang, "clipboardImageImport.title"),
          message: t(lang, "clipboardImageImport.message"),
          confirmText: t(lang, "clipboardImageImport.confirm")
        }),
      readClipboardImage: () => readClipboardImageSafely(),
      saveConfirmedImage: async (file) => {
        const leaf = await this.activateView();
        if (!(leaf?.view instanceof MemosPlusView)) {
          return false;
        }
        return leaf.view.insertConfirmedClipboardImage(file);
      }
    });
    if (result === "empty") {
      new Notice(t(lang, "clipboardImageImport.empty"));
    } else if (result === "failed") {
      new Notice(t(lang, "notice.imageFailed"));
    }
  }

  private handleMemosPlusProtocol(params: ObsidianProtocolData): void {
    const mode = typeof params.mode === "string" ? params.mode : "quick-capture";
    const content = typeof params.content === "string" ? params.content.trim() : "";
    if (content) {
      this.openQuickCaptureWithInitialContent(content);
      return;
    }
    if (mode === "clipboard") {
      this.openQuickCaptureWithContentSource("clipboard", true);
      return;
    }
    this.openQuickCaptureWithContentSource("auto");
  }

  async exportDiagnosticLog(): Promise<void> {
    const path = await exportMemosPlusDiagnosticLog(this.app);
    new Notice(t(this.settings.language, "notice.diagnosticLogExported") + path);
  }

  async syncAppleNow(showNotice = true): Promise<boolean> {
    const lang = this.settings.language;
    try {
      const result = await this.appleSync.syncNow();
      if (result.waiting > 0) this.scheduleAppleSyncRetry();
      else this.clearAppleSyncRetry();
      if (showNotice) {
        new Notice(
          t(lang, "notice.appleSyncComplete")
            .replace("{pushed}", String(result.pushed))
            .replace("{pulled}", String(result.pulled))
            .replace("{imported}", String(result.imported))
            .replace("{deleted}", String(result.deletedLocal + result.deletedRemote))
        );
      }
      return true;
    } catch (error) {
      if (isRetryableAppleSyncError(error)) this.scheduleAppleSyncRetry();
      if (showNotice) {
        new Notice(t(lang, "notice.appleSyncFailed").replace("{error}", error instanceof Error ? error.message : String(error)));
      }
      return false;
    }
  }

  async testAppleSyncConnection(): Promise<void> {
    const lang = this.settings.language;
    try {
      const target = "reminders" as const;
      const probe = await this.appleSync.probe(target);
      const selected = this.settings.appleRemindersList;
      const available = probe.reminderLists.includes(selected);
      if (available) {
        new Notice(t(lang, "notice.appleSyncConnectionOk").replace("{name}", selected));
        return;
      }
      const candidates = probe.reminderLists;
      new Notice(
        t(lang, "notice.appleSyncContainerMissing")
          .replace("{name}", selected)
          .replace("{available}", candidates.length > 0 ? candidates.join("、") : t(lang, "notice.appleSyncContainerNone"))
      );
    } catch (error) {
      new Notice(t(lang, "notice.appleSyncFailed").replace("{error}", error instanceof Error ? error.message : String(error)));
    }
  }

  async createAppleSyncContainer(): Promise<void> {
    const lang = this.settings.language;
    const target = "reminders" as const;
    try {
      const name = await this.appleSync.createContainer(target, "Memos Plus");
      this.settings.appleRemindersList = name;
      await this.persistSettings();
      new Notice(t(lang, "notice.appleSyncContainerCreated").replace("{name}", name));
    } catch (error) {
      new Notice(t(lang, "notice.appleSyncFailed").replace("{error}", error instanceof Error ? error.message : String(error)));
    }
  }

  private registerTaskManagerStatusBarItem(): void {
    const item = this.addStatusBarItem();
    item.addClass("memos-plus-task-status-item");
    item.setAttrs({
      role: "button",
      tabindex: "0",
      title: t(this.settings.language, "quickTaskPanel.open"),
      "aria-label": t(this.settings.language, "quickTaskPanel.open"),
      "aria-haspopup": "dialog",
      "aria-expanded": "false"
    });
    setIcon(item, "list-todo");
    this.quickTaskPanel = new QuickTaskPanel(this, item);
    const toggle = () => this.quickTaskPanel?.toggle();
    item.addEventListener("click", toggle);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  }

  updateTaskCalendarRibbon(visible: boolean): void {
    this.taskCalendarRibbonEl?.remove();
    this.taskCalendarRibbonEl = null;
    if (!visible) return;
    this.taskCalendarRibbonEl = this.addRibbonIcon("calendar-days", t(this.settings.language, "command.openTaskCalendar"), () => {
      this.runAsyncOperation("activate task calendar from ribbon", () => this.openTaskCalendar());
    });
  }

  async createTaskCalendarInboxTask(content: string, dueDate = "", preset?: ProjectTaskOptions): Promise<boolean> {
    const text = content.trim();
    if (!text) return false;
    const path = normalizePath(this.settings.taskCalendar.inboxPath.trim().replace(/^\/+/, ""));
    if (!path) return false;
    const task = preset ?? await openTaskOptionsModal(this.app, {
      language: this.settings.language,
      title: t(this.settings.language, "projectSend.taskOptions"),
      description: text,
      taskSettings: {
        enabled: this.settings.tasksFormatEnabled,
        defaultPriority: this.settings.taskDefaultPriority,
        defaultDueDate: dueDate || this.settings.taskDefaultDueDate,
        defaultScheduledDate: this.settings.taskDefaultScheduledDate,
        defaultRecurrence: this.settings.taskDefaultRecurrence,
        addCreatedDate: this.settings.taskAddCreatedDate,
        appleSyncEnabled: this.settings.appleSyncEnabled,
        appleSyncTag: this.settings.appleSyncTag,
        defaultSyncTarget: this.settings.appleSyncEnabled ? "reminders" : "tasks"
      },
      defaultAsTask: true,
      allowPlain: false,
      hideSyncTarget: true
    });
    if (task === null) return false;
    const line = renderTaskContentWithOptions(text, task ?? { isTask: true }, this.settings);
    try {
      let file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        const source = await this.app.vault.cachedRead(file);
        await this.app.vault.append(file, `${source.endsWith("\n") || !source ? "" : "\n"}${line}\n`);
      } else if (!file) {
        await ensureTaskCalendarParentFolders(this.app, path);
        file = await this.app.vault.create(path, `# 任务收件箱\n\n${line}\n`);
      } else {
        throw new Error("Task inbox path is occupied by a folder");
      }
      if (file instanceof TFile) {
        await this.onUnifiedTaskWritten(file, task ?? { isTask: true });
        await this.onContentWritten(file, text, "任务收件箱");
      }
      new Notice(t(this.settings.language, "notice.taskCalendarTaskCreated"));
      return true;
    } catch (error) {
      console.error("Memos Plus: failed to create task calendar task", error);
      new Notice(t(this.settings.language, "notice.taskCalendarTaskFailed"));
      return false;
    }
  }

  openUnifiedTaskComposer(options: OpenUnifiedTaskComposerOptions): Promise<boolean> {
    return openUnifiedTaskComposer(this, options);
  }

  async createUnifiedTask(content: string, task: ProjectTaskOptions, target: ProjectSendChoice | null): Promise<boolean> {
    const text = content.trim();
    if (!text) return false;
    if (!target) return this.createTaskCalendarInboxTask(text, task.dueDate, task);
    try {
      const delivery = await deliverContentToProjectChoice(
        {
          app: this.app,
          store: this.store,
          settings: this.settings,
          persistSettings: () => this.persistSettings(),
          selectProjectTargetOnMobile: (options) => this.selectProjectTargetOnMobile(options),
          onTaskWritten: (file, writtenTask) => this.onUnifiedTaskWritten(file, writtenTask),
          onContentWritten: (file, writtenContent, heading) => this.onContentWritten(file, writtenContent, heading)
        },
        text,
        target,
        { manualCalloutMode: false, task }
      );
      if (!delivery) return false;
      await this.refreshViews("unifiedTaskCreated");
      new Notice(`${t(this.settings.language, "notice.sentToFile")}${delivery.file.basename}`);
      return true;
    } catch (error) {
      console.error("Memos Plus: failed to create unified task", error);
      new Notice(t(this.settings.language, "notice.taskCalendarTaskFailed"));
      return false;
    }
  }

  async onUnifiedTaskWritten(file: TFile, task: ProjectTaskOptions): Promise<void> {
    await this.taskIndex.updateFile(file);
    if (this.settings.appleSyncEnabled && task.syncTarget !== "tasks") {
      this.runAsyncOperation("sync Apple after unified task write", () => this.syncAppleNow(false));
    }
  }

  async onContentWritten(file: TFile, content: string, sourceHeading = ""): Promise<void> {
    try {
      const card = await this.learningCards.createFromCollectedContent({
        filePath: file.path,
        heading: sourceHeading,
        content
      });
      if (card) new Notice(this.settings.language === "zh" ? "已创建复习卡" : "Learning card created");
    } catch (error) {
      // Collection has already reached Markdown at this point.  A local card
      // persistence problem must never make a successful capture look failed.
      console.error("Memos Plus: failed to create learning card", error);
      new Notice(this.settings.language === "zh" ? "内容已收录，但复习卡创建失败" : "Content saved, but the learning card could not be created");
    }
  }

  openTodayLearningReview(): void {
    new LearningReviewModal(this.app, {
      service: this.learningCards,
      language: this.settings.language,
      onFinished: () => this.scheduleRefreshViews("learning-review-finished", Platform.isMobile ? 250 : 80)
    }).open();
  }

  async toggleTaskCalendarTask(item: TaskIndexItem): Promise<boolean> {
    const updated = await this.toggleTaskIndexItem(item);
    if (updated && this.settings.appleSyncEnabled && item.line.includes(normalizeAppleSyncTag(this.settings.appleSyncTag))) {
      void this.syncAppleNow(false);
    }
    return updated;
  }

  async openTaskCalendarTask(item: TaskIndexItem): Promise<void> {
    await openIndexedTask(this.app, item);
  }

  openTaskCalendarQuickCapture(): void {
    this.openQuickCaptureWithContentSource("auto");
  }

  canEditTaskCalendarTask(): boolean {
    return Boolean(getTasksApi(this.app)?.editTaskLineModal);
  }

  async editTaskCalendarTask(item: TaskIndexItem): Promise<boolean> {
    return this.editTaskIndexItem(item);
  }

  async openCurrentTaskEditor(editor: Editor, file: TFile | null): Promise<void> {
    const task = taskAtEditorCursor(editor, file);
    if (!task) {
      new Notice(t(this.settings.language, "notice.currentLineNotTask"));
      return;
    }
    await this.openTaskCalendarTaskEditor(task);
  }

  async openTaskCalendarTaskEditor(item: TaskIndexItem): Promise<void> {
    await openTaskCalendarTaskEditorModal(this, item);
  }

  createTaskCalendarEditSession(item: TaskIndexItem): TaskCalendarEditSession {
    return new TaskCalendarEditSession({
      task: item,
      context: {
        projectTagPrefix: this.settings.projectTag,
        appleSyncTag: this.settings.appleSyncTag
      },
      persist: (sourceTask, patch) => this.updateTaskCalendarTask(sourceTask, patch, false),
      shouldSync: (task) => this.shouldSyncEditedTask(task),
      sync: () => this.syncAppleNow(false)
    });
  }

  taskCalendarAppleStatus(task: TaskIndexItem): { label: string; title: string; error: boolean } | null {
    const target = task.syncTarget || (task.appleSyncTagged || task.appleSyncId ? "reminders" : "");
    if (!target) return null;
    const targetLabel = t(this.settings.language, target === "calendar" ? "taskCalendar.appleCalendar" : "taskCalendar.appleReminders");
    const recordKey = task.appleSyncId ? `${target}:${task.appleSyncId}` : "";
    const pending = Boolean(recordKey && this.settings.appleSyncState.pending[recordKey]);
    const synced = Boolean(recordKey && this.settings.appleSyncState.records[recordKey]);
    const error = this.settings.appleSyncState.lastError;
    if (pending) return {
      label: `↻ ${t(this.settings.language, "taskCalendar.applePending")}`,
      title: t(this.settings.language, "taskCalendar.applePending"),
      error: false
    };
    if (error) return { label: `⚠ ${t(this.settings.language, "taskCalendar.appleFailed")}`, title: error, error: true };
    return {
      label: synced ? `✓ ${targetLabel}` : `↻ ${t(this.settings.language, "taskCalendar.applePending")}`,
      title: synced ? t(this.settings.language, "taskCalendar.appleSynced") : t(this.settings.language, "taskCalendar.applePending"),
      error: false
    };
  }

  async updateTaskCalendarTask(item: TaskIndexItem, patch: TaskCalendarTaskPatch, syncApple = true): Promise<boolean> {
    try {
      const result = await updateIndexedTaskFromCalendar(this.app, item, patch, {
        projectTagPrefix: this.settings.projectTag,
        appleSyncTag: this.settings.appleSyncTag
      });
      if (!result.updated || !result.file) {
        showTaskMutationFailure(this.settings.language);
        return false;
      }
      await this.taskIndex.updateFile(result.file);
      if (syncApple && this.settings.appleSyncEnabled && item.line.includes(normalizeAppleSyncTag(this.settings.appleSyncTag))) {
        void this.syncAppleNow(false);
      }
      return true;
    } catch (error) {
      console.error("Memos Plus: failed to update task from Schedule and Tasks", error);
      showTaskMutationFailure(this.settings.language);
      return false;
    }
  }

  async refreshTaskCalendarTasks(): Promise<void> {
    await this.taskIndex.rebuild({ force: true });
    if (this.settings.appleSyncEnabled && this.appleSync.isAvailable()) {
      await this.syncAppleNow(false);
    }
  }

  private async toggleTaskIndexItem(item: TaskIndexItem): Promise<boolean> {
    try {
      const result = await toggleIndexedTask(this.app, item);
      if (!result.updated || !result.file) {
        showTaskMutationFailure(this.settings.language);
        return false;
      }
      await this.taskIndex.updateFile(result.file);
      return true;
    } catch (error) {
      console.error("Memos Plus: failed to toggle indexed task", error);
      showTaskMutationFailure(this.settings.language);
      return false;
    }
  }

  private async editTaskIndexItem(item: TaskIndexItem): Promise<boolean> {
    try {
      const result = await editIndexedTaskWithTasksApi(this.app, item);
      if (result.failure === "cancelled") {
        return false;
      }
      if (!result.updated || !result.file) {
        showTaskMutationFailure(this.settings.language);
        return false;
      }
      await this.taskIndex.updateFile(result.file);
      return true;
    } catch (error) {
      console.error("Memos Plus: failed to edit indexed task", error);
      showTaskMutationFailure(this.settings.language);
      return false;
    }
  }

  private shouldSyncEditedTask(task: TaskIndexItem): boolean {
    if (!this.settings.appleSyncEnabled) return false;
    if (task.syncTarget === "calendar" || task.syncTarget === "reminders" || task.appleSyncTagged || task.appleSyncId) return true;
    return task.line.includes(normalizeAppleSyncTag(this.settings.appleSyncTag));
  }

  async saveSettings(): Promise<void> {
    logMemosPlusDiagnostic("settings:save", {
      refreshViews: true
    });
    await this.savePluginData("saveSettings");
    this.maybeScheduleTaskIndexBuild(0);
    await this.refreshViews("saveSettings");
  }

  async persistSettings(): Promise<void> {
    logMemosPlusDiagnostic("settings:persist", {
      refreshViews: false
    });
    await this.savePluginData("persistSettings");
  }

  private runAsyncOperation(source: string, operation: () => Promise<unknown>): void {
    void operation().catch((error) => {
      console.warn(`[Memos Plus] ${source} failed`, error);
    });
  }

  private async savePluginData(source: string): Promise<void> {
    return this.settingsSaveQueue.run(async () => {
      setMemosPlusDiagnosticState({ isSaving: true });
      logMemosPlusDiagnostic("data:save", { phase: "start", source });
      try {
        await this.saveData(this.settings);
        logMemosPlusDiagnostic("data:save", { phase: "end", source });
      } catch (error) {
        logMemosPlusDiagnostic("data:save", {
          phase: "error",
          source,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });
        throw error;
      } finally {
        setMemosPlusDiagnosticState({ isSaving: false });
      }
    });
  }

  private scheduleRefreshViews(source: string, delayMs = 200): void {
    const memosLeaves = this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE).length;
    if (memosLeaves === 0) {
      return;
    }
    this.clearTaskIndexRefreshTimer();
    this.taskIndexRefreshTimer = window.setTimeout(() => {
      this.taskIndexRefreshTimer = null;
      this.runAsyncOperation("refresh views", () => this.refreshViews(source));
    }, delayMs);
  }

  private clearTaskIndexRefreshTimer(): void {
    if (this.taskIndexRefreshTimer === null) {
      return;
    }
    window.clearTimeout(this.taskIndexRefreshTimer);
    this.taskIndexRefreshTimer = null;
  }

  async refreshViews(source = "manual"): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE);
    logMemosPlusDiagnostic("view:refresh", {
      source,
      memosLeaves: leaves.length
    });
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MemosPlusView) {
        if (source === "task-index-change" && view.hasActiveComposerInput()) {
          logMemosPlusDiagnostic("view:refresh-skipped", {
            source,
            reason: "active-composer-draft"
          });
          continue;
        }
        await view.reload();
      }
    }
  }

  async refreshLayoutViews(source = "layout-settings"): Promise<void> {
    await this.refreshViews(source);
    await this.refreshQuickInputViews(source);
  }

  async refreshQuickInputViews(source = "manual"): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE);
    logMemosPlusDiagnostic("view:refresh", {
      source,
      quickInputLeaves: leaves.length
    });
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MemosPlusQuickInputView) {
        await view.reload();
      }
    }
  }

  private async captureClipboardLinkToMemos(): Promise<void> {
    await captureClipboardLinkToMemos({
      readClipboard: () => this.readClipboardText(),
      resolveMarkdownLink: (text) => this.resolveMarkdownLink(text),
      store: this.store,
      settings: this.settings,
      refreshViews: () => this.refreshViews(),
      notice: (message) => new Notice(message)
    });
  }

  private async readClipboardText(): Promise<string> {
    return (await navigator.clipboard.readText()).trim();
  }

  async resolveMarkdownLink(text: string): Promise<string | null> {
    if (!this.settings.linkAnalysisEnabled || (Platform.isMobile && !this.settings.linkAnalysisMobileEnabled)) {
      return null;
    }
    return resolveClipboardMarkdownLink(text, (url) => this.fetchCachedLinkTitle(url), {
      maxLinks: this.effectiveLinkAnalysisMaxLinks(),
      timeoutMs: this.settings.linkAnalysisTimeoutMs
    });
  }

  private effectiveLinkAnalysisMaxLinks(): number {
    if (this.settings.performanceSafeMode || (Platform.isMobile && this.settings.mobilePerformanceMode)) {
      return 1;
    }
    return this.settings.linkAnalysisMaxLinks;
  }

  private fetchCachedLinkTitle(url: string): Promise<string> {
    const cached = this.linkAnalysisTitleCache.get(url);
    if (cached) {
      this.linkAnalysisTitleCache.delete(url);
      this.linkAnalysisTitleCache.set(url, cached);
      return cached;
    }
    const pending: Promise<string> = fetchPageTitle(url, async (requestUrlValue) => {
      const response = await requestUrl({
        url: requestUrlValue,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 AppleWebKit/605.1.15 Mobile Safari/605.1.15"
        }
      });
      return {
        text: response.text,
        headers: response.headers
      };
    }).catch((error) => {
      if (this.linkAnalysisTitleCache.get(url) === pending) {
        this.linkAnalysisTitleCache.delete(url);
      }
      console.warn("[Memos Plus] Link title request failed", error);
      return "";
    });
    this.linkAnalysisTitleCache.set(url, pending);
    while (this.linkAnalysisTitleCache.size > LINK_ANALYSIS_TITLE_CACHE_LIMIT) {
      const oldestUrl = this.linkAnalysisTitleCache.keys().next().value as string | undefined;
      if (!oldestUrl) {
        break;
      }
      this.linkAnalysisTitleCache.delete(oldestUrl);
    }
    return pending;
  }

  private registerVaultIndexInvalidation(): void {
    const invalidateFile = (file: unknown) => {
      if (file instanceof TFile) {
        this.vaultIndex.invalidate(file.path);
        return;
      }
      this.vaultIndex.invalidate();
    };
    this.registerEvent(this.app.vault.on("create", invalidateFile));
    this.registerEvent(this.app.vault.on("modify", invalidateFile));
    this.registerEvent(this.app.vault.on("delete", invalidateFile));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.vaultIndex.invalidate(oldPath);
        invalidateFile(file);
      })
    );
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.vaultIndex.invalidate(file.path)));
  }

  private registerTaskIndexInvalidation(): void {
    const shouldTrackTasks = (): boolean => this.settings.taskVaultFilterEnabled && this.settings.taskIndexEnabled;
    const scheduleInitialBuild = (): void => {
      if (Platform.isMobile && this.settings.taskIndexDelayOnMobile) {
        return;
      }
      if (this.shouldBuildTaskIndexForLayouts()) {
        this.taskIndex.scheduleBuild();
      }
    };
    const updateFile = (file: unknown) => {
      if (!shouldTrackTasks()) {
        return;
      }
      if (!(file instanceof TFile) || file.extension !== "md") {
        return;
      }
      if (this.taskIndex.getStatus().cacheState === "normal") {
        this.runAsyncOperation("incremental task index update", () => this.taskIndex.updateFile(file));
        return;
      }
      this.taskIndex.invalidate(file.path);
      scheduleInitialBuild();
    };
    const deleteFile = (file: unknown) => {
      if (!shouldTrackTasks()) {
        return;
      }
      if (file instanceof TFile && file.extension === "md" && this.taskIndex.getStatus().cacheState === "normal") {
        this.taskIndex.removeFile(file.path);
        return;
      }
      if (!(file instanceof TFile) || file.extension !== "md") {
        return;
      }
      this.taskIndex.invalidate(file.path);
      scheduleInitialBuild();
    };
    this.registerEvent(this.app.vault.on("create", updateFile));
    this.registerEvent(this.app.vault.on("modify", updateFile));
    this.registerEvent(this.app.vault.on("delete", deleteFile));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!shouldTrackTasks()) {
          return;
        }
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }
        if (this.taskIndex.getStatus().cacheState === "normal") {
          this.taskIndex.removeFile(oldPath);
          this.runAsyncOperation("incremental task index rename", () => this.taskIndex.updateFile(file));
          return;
        }
        this.taskIndex.invalidate(oldPath);
        updateFile(file);
      })
    );
  }

  private maybeBuildTaskIndexAfterLoad(): void {
    if (!this.settings.taskVaultFilterEnabled || !this.settings.taskIndexEnabled || !this.settings.taskIndexAutoBuild || !this.shouldBuildTaskIndexForLayouts()) {
      return;
    }
    if (Platform.isMobile && this.settings.taskIndexDelayOnMobile) {
      return;
    }
    this.app.workspace.onLayoutReady(() => {
      const timer = window.setTimeout(() => {
        this.runAsyncOperation("build startup task index", async () => {
          if (viewLayoutsNeedData(this.currentViewLayouts(), "vaultIndex")) {
            await this.vaultIndex.warm();
          }
          await this.taskIndex.ensureBuilt();
        });
      }, 1_200);
      this.register(() => window.clearTimeout(timer));
    });
  }

  private registerAppleSyncSchedule(): void {
    if (!this.appleSync.isAvailable()) {
      return;
    }
    this.registerInterval(
      window.setInterval(() => {
        if (!this.shouldRunScheduledAppleSync()) {
          return;
        }
        this.runAsyncOperation("scheduled Apple sync", () => this.syncAppleNow(false));
      }, 60_000)
    );
    if (this.settings.appleSyncEnabled && this.settings.appleSyncOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        const timer = window.setTimeout(() => {
          this.runAsyncOperation("startup Apple sync", () => this.syncAppleNow(false));
        }, 2_500);
        this.register(() => window.clearTimeout(timer));
      });
    }
  }

  private scheduleAppleSyncRetry(): void {
    if (this.appleSyncRetryTimer !== null || !this.settings.appleSyncEnabled || !this.appleSync.isAvailable()) return;
    const delays = [30_000, 120_000, 300_000, 900_000];
    const delay = delays[Math.min(this.appleSyncRetryAttempt, delays.length - 1)];
    this.appleSyncRetryAttempt = Math.min(this.appleSyncRetryAttempt + 1, delays.length - 1);
    this.appleSyncRetryTimer = window.setTimeout(() => {
      this.appleSyncRetryTimer = null;
      this.runAsyncOperation("retry Apple sync", () => this.syncAppleNow(false));
    }, delay);
  }

  private clearAppleSyncRetry(): void {
    if (this.appleSyncRetryTimer !== null) window.clearTimeout(this.appleSyncRetryTimer);
    this.appleSyncRetryTimer = null;
    this.appleSyncRetryAttempt = 0;
  }

  private shouldRunScheduledAppleSync(now = Date.now()): boolean {
    if (!this.settings.appleSyncEnabled || this.settings.appleSyncIntervalMinutes <= 0) {
      return false;
    }
    const lastSync = Date.parse(this.settings.appleSyncState.lastSyncAt);
    return !Number.isFinite(lastSync) || now - lastSync >= this.settings.appleSyncIntervalMinutes * 60_000;
  }

  private maybeWarmVaultIndexAfterLoad(): void {
    if (!viewLayoutsNeedData(this.currentViewLayouts(), "vaultIndex")) {
      return;
    }
    this.app.workspace.onLayoutReady(() => {
      this.clearVaultIndexWarmTimer();
      this.vaultIndexWarmTimer = window.setTimeout(() => {
        this.vaultIndexWarmTimer = null;
        this.runAsyncOperation("warm vault metadata index", () => this.vaultIndex.warm());
      }, Platform.isMobile ? 2_500 : 800);
    });
  }

  private clearVaultIndexWarmTimer(): void {
    if (this.vaultIndexWarmTimer === null) {
      return;
    }
    window.clearTimeout(this.vaultIndexWarmTimer);
    this.vaultIndexWarmTimer = null;
  }

  private maybeScheduleTaskIndexBuild(delayMs = 800): void {
    if (!this.settings.taskVaultFilterEnabled || !this.settings.taskIndexEnabled || !this.shouldBuildTaskIndexForLayouts()) {
      return;
    }
    if (Platform.isMobile && this.settings.taskIndexDelayOnMobile) {
      return;
    }
    const status = this.taskIndex.getStatus();
    if (status.updating || status.cacheState === "normal") {
      return;
    }
    this.taskIndex.scheduleBuild(delayMs);
  }

  private shouldBuildTaskIndexForLayouts(): boolean {
    return viewLayoutsNeedData(this.currentViewLayouts(), "tasks");
  }

  private currentViewLayouts(): ViewLayoutsSettings {
    return {
      home: this.settings.homeLayout,
      sidebar: this.settings.sidebarLayout,
      mobile: this.settings.mobileLayout
    };
  }

}

function isRetryableAppleSyncError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return !/没有访问|not authorized|not permitted|permission|not found|read-only|disabled|only in Obsidian Desktop/i.test(message);
}

function showTaskMutationFailure(language: Parameters<typeof t>[0]): void {
  new Notice(t(language, "taskManager.updateFailed"));
}

async function ensureTaskCalendarParentFolders(app: MemosPlusPlugin["app"], filePath: string): Promise<void> {
  const parts = filePath.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}
