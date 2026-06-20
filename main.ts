import { Notice, Platform, Plugin, TFile, WorkspaceLeaf, requestUrl, type ObsidianProtocolData } from "obsidian";
import { MemosPlusSettingTab, MemosPlusSettings, normalizeSettings } from "./src/settings";
import { MemosPlusStore } from "./src/store";
import { QuickCaptureModal } from "./src/modal";
import { MEMOS_PLUS_VIEW_TYPE, MemosPlusView } from "./src/view";
import { MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE, MemosPlusQuickInputView, shouldUseQuickInputModalFallback } from "./src/quickInputView";
import { t } from "./src/i18n";
import { MemosPlusLinkSuggest, MemosPlusTagSuggest } from "./src/editorSuggest";
import { captureClipboardLinkToMemos } from "./src/linkCaptureActions";
import { fetchPageTitle, resolveClipboardMarkdownLink } from "./src/linkCapture";
import type { QuickCaptureInitialContentMode } from "./src/quickCaptureContent";
import { TaskIndex } from "./src/taskIndex";
import { VaultMetadataIndex } from "./src/vaultIndex";
import { viewLayoutsNeedData, type ViewLayoutsSettings } from "./src/displayModules";

export default class MemosPlusPlugin extends Plugin {
  settings: MemosPlusSettings = normalizeSettings({});
  store!: MemosPlusStore;
  vaultIndex!: VaultMetadataIndex;
  taskIndex!: TaskIndex;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.vaultIndex = new VaultMetadataIndex(this.app);
    this.taskIndex = new TaskIndex(this.app, { isMobile: () => Platform.isMobile });
    this.store = new MemosPlusStore(this.app, () => this.settings, this.vaultIndex);
    this.registerVaultIndexInvalidation();
    this.registerTaskIndexInvalidation();
    this.register(this.taskIndex.onChange(() => void this.refreshViews()));

    this.registerView(MEMOS_PLUS_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusView(leaf, this));
    this.registerView(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemosPlusQuickInputView(leaf, this));
    this.registerEditorSuggest(new MemosPlusTagSuggest(this.app));
    this.registerEditorSuggest(new MemosPlusLinkSuggest(this.app));

    this.addRibbonIcon("message-square-plus", t(this.settings.language, "command.open"), () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-memos-plus",
      name: t(this.settings.language, "command.open"),
      callback: () => {
        void this.activateView();
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
      id: "open-memos-plus-quick-input-sidebar",
      name: t(this.settings.language, "command.openQuickInputSidebar"),
      callback: () => {
        void this.activateQuickInputView();
      }
    });

    this.addCommand({
      id: "capture-clipboard-link-to-memos",
      name: t(this.settings.language, "command.linkCaptureDefault"),
      callback: () => {
        void this.captureClipboardLinkToMemos();
      }
    });

    this.addCommand({
      id: "focus-composer",
      name: t(this.settings.language, "command.focusComposer"),
      callback: async () => {
        const leaf = await this.activateView();
        if (leaf?.view instanceof MemosPlusView) {
          leaf.view.focusComposer();
        }
      }
    });

    this.registerObsidianProtocolHandler("memos-plus", (params) => {
      this.handleMemosPlusProtocol(params);
    });

    this.addSettingTab(new MemosPlusSettingTab(this.app, this));
    this.maybeBuildTaskIndexAfterLoad();
    if (this.settings.quickInputEnabled && this.settings.quickInputAutoOpen) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateQuickInputView({ focusComposer: false, useModalFallback: false });
      });
    }
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(MEMOS_PLUS_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE);
  }

  async activateView(): Promise<WorkspaceLeaf | null> {
    const existing = this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return existing;
    }

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MEMOS_PLUS_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
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
        refreshViews: () => this.refreshViews()
      }).open();
      return null;
    }
    const existing = this.app.workspace.getLeavesOfType(MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      if (focusComposer && existing.view instanceof MemosPlusQuickInputView) {
        existing.view.focusComposer();
      }
      return existing;
    }
    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    if (focusComposer && leaf.view instanceof MemosPlusQuickInputView) {
      leaf.view.focusComposer();
    }
    return leaf;
  }

  private openQuickCaptureWithContentSource(initialContentMode: QuickCaptureInitialContentMode, showClipboardEmptyNotice = false): void {
    new QuickCaptureModal(this.app, {
      settings: this.settings,
      store: this.store,
      persistSettings: () => this.persistSettings(),
      refreshViews: () => this.refreshViews(),
      initialContentMode,
      showClipboardEmptyNotice
    }).open();
  }

  private openQuickCaptureWithInitialContent(initialContent: string): void {
    new QuickCaptureModal(this.app, {
      settings: this.settings,
      store: this.store,
      persistSettings: () => this.persistSettings(),
      refreshViews: () => this.refreshViews(),
      initialContent,
      initialContentMode: "none"
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

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.store = new MemosPlusStore(this.app, () => this.settings, this.vaultIndex);
    this.maybeScheduleTaskIndexBuild(0);
    await this.refreshViews();
  }

  async persistSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.store = new MemosPlusStore(this.app, () => this.settings, this.vaultIndex);
  }

  async refreshViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(MEMOS_PLUS_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof MemosPlusView) {
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

  private async resolveMarkdownLink(text: string): Promise<string | null> {
    return resolveClipboardMarkdownLink(text, (url) =>
      fetchPageTitle(url, async (requestUrlValue) => {
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
      })
    );
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
