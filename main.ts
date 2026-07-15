import { Notice, Platform, Plugin, TFile, WorkspaceLeaf, requestUrl, type ObsidianProtocolData } from "obsidian";
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

const LINK_ANALYSIS_TITLE_CACHE_LIMIT = 100;

export default class MemosPlusPlugin extends Plugin {
  settings: MemosPlusSettings = normalizeSettings({});
  store!: MemosPlusStore;
  vaultIndex!: VaultMetadataIndex;
  taskIndex!: TaskIndex;
  private diagnosticSessionId = "";
  private taskIndexRefreshTimer: number | null = null;
  private readonly settingsSaveQueue = new SerialTaskQueue();
  private readonly linkAnalysisTitleCache = new Map<string, Promise<string>>();

  async onload(): Promise<void> {
    this.diagnosticSessionId = createMemosPlusSessionId();
    configureMemosPlusDiagnostics({
      enabled: Platform.isMobile,
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
    registerMemosPlusDiagnostics(this, this.app);
    this.registerVaultIndexInvalidation();
    this.registerTaskIndexInvalidation();
    this.register(
      this.taskIndex.onChange(() => {
        if (
          Platform.isMobile &&
          this.settings.taskIndexDelayOnMobile &&
          this.taskIndex.getStatus().cacheState === "needs-update"
        ) {
          return;
        }
        this.scheduleRefreshViews("task-index-change", Platform.isMobile ? 750 : 200);
      })
    );

    this.registerView(MEMOS_PLUS_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusView(leaf, this));
    this.registerView(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusQuickInputView(leaf, this));
    this.registerView(MEMOS_PLUS_MOBILE_PANEL_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusMobilePanelView(leaf, this));
    this.registerEditorSuggest(new MemosPlusTagSuggest(this.app));
    this.registerEditorSuggest(new MemosPlusLinkSuggest(this.app));

    this.addRibbonIcon("message-square-plus", t(this.settings.language, "command.open"), () => {
      this.runAsyncOperation("activate view from ribbon", () => this.activateView());
    });

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
      id: "quick-capture-clipboard",
      name: t(this.settings.language, "command.quickCaptureClipboard"),
      callback: () => {
        this.openQuickCaptureWithContentSource("clipboard", true);
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
    if (this.settings.quickInputEnabled && this.settings.quickInputAutoOpen) {
      this.app.workspace.onLayoutReady(() => {
        this.runAsyncOperation("auto open quick input", () => this.activateQuickInputView({ focusComposer: false, useModalFallback: false }));
      });
    }
  }

  onunload(): void {
    this.clearTaskIndexRefreshTimer();
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
