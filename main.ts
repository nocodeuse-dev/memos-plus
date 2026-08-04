import { Notice, Platform, Plugin, TFile, WorkspaceLeaf, normalizePath, requestUrl, setIcon, type ObsidianProtocolData } from "obsidian";
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
import { editIndexedTaskWithTasksApi, getTasksApi, toggleIndexedTask } from "./src/taskActions";
import { showTaskMutationFailure, TaskManagementModal } from "./src/taskManagementModal";
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
import { buildTasksMarkdownLine } from "./src/tasksFormat";

const LINK_ANALYSIS_TITLE_CACHE_LIMIT = 100;

export default class MemosPlusPlugin extends Plugin {
  settings: MemosPlusSettings = normalizeSettings({});
  store!: MemosPlusStore;
  vaultIndex!: VaultMetadataIndex;
  taskIndex!: TaskIndex;
  appleSync!: AppleSyncService;
  private taskCalendarRibbonEl: HTMLElement | null = null;
  private diagnosticSessionId = "";
  private taskIndexRefreshTimer: number | null = null;
  private vaultIndexWarmTimer: number | null = null;
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
      callback: () => this.openTaskManagement()
    });

    this.addCommand({
      id: "open-task-calendar",
      name: t(this.settings.language, "command.openTaskCalendar"),
      callback: () => this.runAsyncOperation("open task calendar", async () => {
        const leaf = await this.activateTaskCalendarView();
        const view = leaf?.view;
        if (view instanceof TaskCalendarView) view.openDefault();
      })
    });

    this.addCommand({
      id: "open-task-calendar-today",
      name: t(this.settings.language, "command.openTaskCalendarToday"),
      callback: () => this.runAsyncOperation("open task calendar today", async () => {
        const leaf = await this.activateTaskCalendarView();
        const view = leaf?.view;
        if (view instanceof TaskCalendarView) view.openToday();
      })
    });

    this.addCommand({
      id: "quick-add-task",
      name: t(this.settings.language, "command.quickAddTask"),
      callback: () => this.runAsyncOperation("focus task calendar quick task", async () => {
        const leaf = await this.activateTaskCalendarView();
        const view = leaf?.view;
        if (view instanceof TaskCalendarView) view.focusQuickTaskInput();
      })
    });

    this.addCommand({
      id: "open-task-calendar-inbox",
      name: t(this.settings.language, "command.openTaskCalendarInbox"),
      callback: () => this.runAsyncOperation("open task calendar inbox", async () => {
        const leaf = await this.activateTaskCalendarView();
        const view = leaf?.view;
        if (view instanceof TaskCalendarView) view.openInbox();
      })
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
    this.clearTaskIndexRefreshTimer();
    this.clearVaultIndexWarmTimer();
    logMemosPlusDiagnostic("memos-plus:onunload", {
      memosLeaves: this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE).length,
      quickInputLeaves: this.app.workspace.getLeavesOfType(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE).length
    });
  }

  async activateView(): Promise<WorkspaceLeaf | null> {
    const existing = this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return existing;
    }

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MEMOS_PLUS_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async activateTaskCalendarView(): Promise<WorkspaceLeaf | null> {
    const existing = this.app.workspace.getLeavesOfType(MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return existing;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MEMOS_PLUS_TASK_CALENDAR_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
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
        selectProjectTargetOnMobile: (options) => this.selectProjectTargetOnMobile(options)
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
      selectProjectTargetOnMobile: (options) => this.selectProjectTargetOnMobile(options)
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
      selectProjectTargetOnMobile: (options) => this.selectProjectTargetOnMobile(options)
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

  async syncAppleNow(showNotice = true): Promise<void> {
    const lang = this.settings.language;
    try {
      const result = await this.appleSync.syncNow();
      if (showNotice) {
        new Notice(
          t(lang, "notice.appleSyncComplete")
            .replace("{pushed}", String(result.pushed))
            .replace("{pulled}", String(result.pulled))
            .replace("{imported}", String(result.imported))
        );
      }
    } catch (error) {
      if (showNotice) {
        new Notice(t(lang, "notice.appleSyncFailed").replace("{error}", error instanceof Error ? error.message : String(error)));
      }
    }
  }

  async testAppleSyncConnection(): Promise<void> {
    const lang = this.settings.language;
    try {
      const target = this.settings.appleSyncTarget;
      const probe = await this.appleSync.probe(target);
      const selected = target === "reminders" ? this.settings.appleRemindersList : this.settings.appleCalendarName;
      const available =
        target === "reminders"
          ? probe.reminderLists.includes(selected)
          : probe.calendars.some((calendar) => calendar.name === selected && calendar.writable);
      if (available) {
        new Notice(t(lang, "notice.appleSyncConnectionOk").replace("{name}", selected));
        return;
      }
      const candidates =
        target === "reminders"
          ? probe.reminderLists
          : probe.calendars.filter((calendar) => calendar.writable).map((calendar) => calendar.name);
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
    const target = this.settings.appleSyncTarget;
    try {
      const name = await this.appleSync.createContainer(target, "Memos Plus");
      if (target === "calendar") {
        this.settings.appleCalendarName = name;
      } else {
        this.settings.appleRemindersList = name;
      }
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
      title: t(this.settings.language, "taskManager.open"),
      "aria-label": t(this.settings.language, "taskManager.open")
    });
    setIcon(item, "list-todo");
    const open = () => this.openTaskManagement();
    item.addEventListener("click", open);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }

  updateTaskCalendarRibbon(visible: boolean): void {
    this.taskCalendarRibbonEl?.remove();
    this.taskCalendarRibbonEl = null;
    if (!visible) return;
    this.taskCalendarRibbonEl = this.addRibbonIcon("calendar-days", t(this.settings.language, "command.openTaskCalendar"), () => {
      this.runAsyncOperation("activate task calendar from ribbon", async () => {
        const leaf = await this.activateTaskCalendarView();
        const view = leaf?.view;
        if (view instanceof TaskCalendarView) view.openDefault();
      });
    });
  }

  async createTaskCalendarInboxTask(content: string, dueDate = ""): Promise<boolean> {
    const text = content.trim();
    if (!text) return false;
    const path = normalizePath(this.settings.taskCalendar.inboxPath.trim().replace(/^\/+/, ""));
    if (!path) return false;
    const line = buildTasksMarkdownLine(text, {
      dueDate,
      priority: this.settings.taskDefaultPriority,
      addCreatedDate: this.settings.taskAddCreatedDate
    });
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
      if (file instanceof TFile) await this.taskIndex.updateFile(file);
      new Notice(t(this.settings.language, "notice.taskCalendarTaskCreated"));
      return true;
    } catch (error) {
      console.error("Memos Plus: failed to create task calendar task", error);
      new Notice(t(this.settings.language, "notice.taskCalendarTaskFailed"));
      return false;
    }
  }

  async toggleTaskCalendarTask(item: TaskIndexItem): Promise<boolean> {
    return this.toggleTaskIndexItem(item);
  }

  async openTaskCalendarTask(item: TaskIndexItem): Promise<void> {
    await openIndexedTask(this.app, item);
  }

  private openTaskManagement(): void {
    new TaskManagementModal(this.app, {
      language: this.settings.language,
      taskIndex: this.taskIndex,
      canEditWithTasksApi: Boolean(getTasksApi(this.app)?.editTaskLineModal),
      onQuickCapture: () => this.openQuickCaptureWithContentSource("auto"),
      onOpenTask: (item) => openIndexedTask(this.app, item),
      onToggleTask: (item) => this.toggleTaskIndexItem(item),
      onEditTask: (item) => this.editTaskIndexItem(item)
    }).open();
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
    const scheduleForFile = (file: unknown) => {
      if (!this.settings.taskVaultFilterEnabled || !this.settings.taskIndexEnabled) {
        return;
      }
      if (file instanceof TFile) {
        this.taskIndex.invalidate(file.path);
      } else {
        this.taskIndex.invalidate();
      }
      if (Platform.isMobile && this.settings.taskIndexDelayOnMobile) {
        return;
      }
      if (this.shouldBuildTaskIndexForLayouts()) {
        this.taskIndex.scheduleBuild();
      }
    };
    this.registerEvent(this.app.vault.on("create", scheduleForFile));
    this.registerEvent(this.app.vault.on("modify", scheduleForFile));
    this.registerEvent(this.app.vault.on("delete", scheduleForFile));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.taskIndex.invalidate(oldPath);
        scheduleForFile(file);
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
      this.taskIndex.scheduleBuild(1200);
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

async function ensureTaskCalendarParentFolders(app: MemosPlusPlugin["app"], filePath: string): Promise<void> {
  const parts = filePath.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}
