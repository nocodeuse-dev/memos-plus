import { ItemView, Platform, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import type MemosPlusPlugin from "../main";
import { createComposerSession, type ComposerSession } from "./composerSession";
import type { MemoItem } from "./markdown";
import {
  buildQuickInputDirectoryEntries,
  buildQuickInputDirectoryPreview,
  collectQuickInputDirectoryVaultSearches,
  type QuickInputDirectoryEntry,
  type QuickInputDirectoryPreview,
  type QuickInputPreviewItem
} from "./quickInputDirectory";
import { SidebarGroupModal } from "./sidebarGroupModal";
import { t } from "./i18n";
import { createSidebarGroup, type SidebarItem } from "./sidebar";
import type { DefaultSendAction, MemosPlusSettings } from "./settings";
import { todayString } from "./filter";
import { VaultSavedSearchIndex } from "./vaultSearch";
import { hasSidebarDirectoryModules, isSidebarDirectoryModule, resolveViewLayoutModules, type DisplayModuleId } from "./displayModules";
import { logMemosPlusDiagnostic } from "./diagnostics";

export const MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE = "memos-plus-quick-input-view";

export function sendActionForQuickInput(settings: MemosPlusSettings): DefaultSendAction {
  return settings.quickInputDefaultSendAction;
}

export class MemosPlusQuickInputView extends ItemView {
  private composerSession: ComposerSession | null = null;
  private directoryContainerEl: HTMLElement | null = null;
  private memoCache: MemoItem[] | null = null;
  private selectedDirectoryId = "";
  private readonly previewCache = new Map<string, QuickInputDirectoryPreview>();
  private readonly vaultSearchIndex: VaultSavedSearchIndex;
  private readonly previewLimits = new Map<string, number>();
  private readonly previewTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private directoryRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MemosPlusPlugin
  ) {
    super(leaf);
    logMemosPlusDiagnostic("view:constructor", { type: MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE });
    this.vaultSearchIndex = new VaultSavedSearchIndex(this.app, this.plugin.vaultIndex);
  }

  getViewType(): string {
    return MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t(this.plugin.settings.language, "quickInput.title");
  }

  getIcon(): string {
    return "panel-right-open";
  }

  async onOpen(): Promise<void> {
    logMemosPlusDiagnostic("view:onOpen", { type: MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE });
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleDirectoryRefresh()));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleDirectoryRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleDirectoryRefresh()));
    this.render();
  }

  async onClose(): Promise<void> {
    logMemosPlusDiagnostic("view:onClose", { type: MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE });
    await this.persistDraft();
    this.clearPreviewTimers();
    this.clearDirectoryRefreshTimer();
    this.composerSession?.destroy();
    this.composerSession = null;
    this.containerEl.children[1]?.empty();
  }

  focusComposer(): void {
    this.composerSession?.focus();
  }

  private render(): void {
    logMemosPlusDiagnostic("view:render", { type: MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE });
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("memos-plus-quick-input-view");
    container.toggleClass("is-compact-layout", this.plugin.settings.sidebarLayout.compactMode);
    this.composerSession?.destroy();
    this.composerSession = null;
    this.directoryContainerEl = null;
    const modules = this.sidebarModules();
    const lang = this.plugin.settings.language;
    const header = container.createDiv({ cls: "memos-plus-quick-input-header" });
    header.createDiv({ cls: "memos-plus-quick-input-title", text: t(lang, "quickInput.title") });
    if (this.shouldRenderSidebarQuickInput(modules)) {
      header.createDiv({ cls: "memos-plus-quick-input-subtitle", text: t(lang, `sendAction.${sendActionForQuickInput(this.plugin.settings)}`) });
    }

    let directoryRendered = false;
    for (const moduleId of resolveViewLayoutModules(this.plugin.settings.sidebarLayout, "sidebar")) {
      if (moduleId === "quickInput" && this.shouldRenderSidebarQuickInput(modules)) {
        this.renderQuickInputComposer(container);
        continue;
      }
      if (!directoryRendered && isSidebarDirectoryModule(moduleId) && this.shouldRenderSidebarDirectory(modules)) {
        directoryRendered = true;
        this.directoryContainerEl = container.createDiv({ cls: "memos-plus-quick-directory" });
        void this.renderDirectoryArea();
      }
    }
  }

  private renderQuickInputComposer(parent: HTMLElement): void {
    this.composerSession = createComposerSession(
      {
        app: this.app,
        parent,
        settings: this.plugin.settings,
        store: this.plugin.store,
        persistSettings: () => this.plugin.persistSettings(),
        refreshViews: () => this.plugin.refreshViews(),
        registerCleanup: (cleanup) => this.register(cleanup),
        resolveMarkdownLink: (text) => this.plugin.resolveMarkdownLink(text)
      },
      {
        surface: "sidebar",
        defaultSendAction: () => sendActionForQuickInput(this.plugin.settings),
        initialContent: this.plugin.settings.quickInputPreserveDraft ? this.plugin.settings.quickInputDraft : undefined,
        initialContentMode: "auto",
        afterDefaultSave: () => this.updateDraftFromComposer(),
        afterProjectSend: () => this.updateDraftFromComposer(),
        onIncomingContentApplied: () => this.updateDraftFromComposer(),
        onClearDraft: () => this.clearQuickInputDraft()
      }
    );
    void this.composerSession.applyInitialContent();
  }

  private sidebarModules(): Set<DisplayModuleId> {
    return new Set(resolveViewLayoutModules(this.plugin.settings.sidebarLayout, "sidebar"));
  }

  private shouldRenderSidebarQuickInput(modules = this.sidebarModules()): boolean {
    return modules.has("quickInput");
  }

  private shouldRenderSidebarDirectory(modules = this.sidebarModules()): boolean {
    return this.plugin.settings.quickInputShowDirectory && hasSidebarDirectoryModules(modules);
  }

  private shouldRenderSidebarFileList(modules = this.sidebarModules()): boolean {
    return modules.has("fileList");
  }

  private shouldRenderSidebarFileCount(modules = this.sidebarModules()): boolean {
    return modules.has("fileCount");
  }

  private async renderDirectoryArea(): Promise<void> {
    const directoryEl = this.directoryContainerEl;
    if (!directoryEl) {
      return;
    }
    const modules = this.sidebarModules();
    const lang = this.plugin.settings.language;
    directoryEl.empty();
    const header = directoryEl.createDiv({ cls: "memos-plus-quick-directory-header" });
    header.createSpan({ cls: "memos-plus-quick-directory-title", text: t(lang, "quickInput.directory") });
    const add = header.createEl("button", {
      cls: "memos-plus-quick-directory-add",
      attr: { type: "button", "aria-label": t(lang, "quickInput.directoryAdd"), title: t(lang, "quickInput.directoryAdd") }
    });
    setIcon(add, "plus");
    add.addEventListener("click", () => this.createDirectoryGroup());

    const memos = await this.getMemos();
    if (directoryEl !== this.directoryContainerEl) {
      return;
    }
    const entries = buildQuickInputDirectoryEntries(this.plugin.settings, memos, {
      today: todayString(),
      limit: this.plugin.settings.quickInputDirectoryLimit,
      includeCounts: this.shouldRenderSidebarFileCount(modules)
    });
    const list = directoryEl.createDiv({ cls: "memos-plus-quick-directory-list" });
    for (const entry of entries) {
      this.renderDirectoryEntry(list, entry, this.shouldRenderSidebarFileCount(modules));
    }
    const selectedEntry = entries.find((entry) => entry.id === this.selectedDirectoryId);
    if (selectedEntry) {
      if (!this.shouldRenderSidebarFileList(this.sidebarModules())) {
        return;
      }
      this.renderDirectoryResults(directoryEl, selectedEntry);
    }
  }

  private renderDirectoryEntry(container: HTMLElement, entry: QuickInputDirectoryEntry, showCount: boolean): void {
    const row = container.createEl("button", {
      cls: `memos-plus-quick-directory-row${this.selectedDirectoryId === entry.id ? " is-selected" : ""}`,
      attr: { type: "button" }
    });
    const icon = row.createSpan({ cls: "memos-plus-quick-directory-icon" });
    setIcon(icon, entry.icon);
    row.createSpan({ cls: "memos-plus-quick-directory-name", text: entry.title });
    if (showCount && entry.count !== "") {
      row.createSpan({ cls: "memos-plus-quick-directory-count", text: String(entry.count) });
    }
    row.addEventListener("click", () => {
      this.selectDirectoryEntry(entry);
    });
  }

  private selectDirectoryEntry(entry: QuickInputDirectoryEntry): void {
    this.selectedDirectoryId = entry.id;
    void this.renderDirectoryArea();
  }

  private renderDirectoryResults(container: HTMLElement, entry: QuickInputDirectoryEntry): void {
    const lang = this.plugin.settings.language;
    const panel = container.createDiv({ cls: "memos-plus-quick-directory-results" });
    const cached = this.previewCache.get(entry.id);
    const meta = panel.createDiv({ cls: "memos-plus-quick-directory-results-meta" });
    if (!cached) {
      meta.createSpan({ text: `${t(lang, "quickInput.directoryLoading")}  ${entry.title}` });
      this.scheduleDirectoryPreview(entry);
      return;
    }
    const noun = cached.items.some((item) => item.type === "file") ? t(lang, "quickInput.directoryFiles") : t(lang, "quickInput.directoryNotes");
    meta.createSpan({ text: `${cached.total} ${noun}` });
    meta.createSpan({ cls: "memos-plus-quick-directory-results-title", text: entry.title });
    if (cached.items.length === 0) {
      panel.createDiv({ cls: "memos-plus-quick-directory-results-empty", text: t(lang, "quickInput.directoryEmpty") });
      return;
    }
    const list = panel.createDiv({ cls: "memos-plus-quick-directory-result-list" });
    for (const item of cached.items) {
      this.renderDirectoryResultCard(list, item);
    }
    if (cached.total > cached.items.length) {
      const more = panel.createEl("button", {
        cls: "memos-plus-quick-directory-more",
        text: t(lang, "quickInput.directoryMore"),
        attr: { type: "button" }
      });
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextLimit = this.previewLimitFor(entry.id) + this.defaultPreviewLimit();
        this.previewLimits.set(entry.id, nextLimit);
        this.previewCache.delete(entry.id);
        void this.renderDirectoryArea();
      });
    }
  }

  private renderDirectoryResultCard(container: HTMLElement, item: QuickInputPreviewItem): void {
    const card = container.createEl("button", {
      cls: `memos-plus-quick-directory-result-card is-${item.type}`,
      attr: { type: "button" }
    });
    if (item.type === "entry") {
      const icon = card.createSpan({ cls: "memos-plus-quick-directory-icon" });
      setIcon(icon, item.icon);
    }
    const body = card.createSpan({ cls: "memos-plus-quick-directory-result-body" });
    if (item.type === "memo") {
      body.createSpan({ cls: "memos-plus-quick-directory-result-time", text: item.subtitle });
      body.createSpan({ cls: "memos-plus-quick-directory-result-title", text: item.title });
      this.renderTagChips(body, item.memo.tags);
    } else if (item.type === "file") {
      body.createSpan({ cls: "memos-plus-quick-directory-result-time", text: formatPreviewDate(item.modifiedTime) });
      body.createSpan({ cls: "memos-plus-quick-directory-result-title", text: item.title });
      body.createSpan({ cls: "memos-plus-quick-directory-result-subtitle", text: item.subtitle });
      if (item.excerpt) {
        body.createSpan({ cls: "memos-plus-quick-directory-result-excerpt", text: item.excerpt });
      }
      this.renderTagChips(body, item.tags);
    } else {
      body.createSpan({ cls: "memos-plus-quick-directory-result-title", text: item.title });
      body.createSpan({ cls: "memos-plus-quick-directory-result-subtitle", text: item.subtitle });
    }
    card.addEventListener("click", () => {
      if (item.type === "memo") {
        void this.plugin.store.openMemoSource(item.memo);
        return;
      }
      if (item.type === "file") {
        const file = this.app.vault.getAbstractFileByPath(item.path);
        if (file instanceof TFile) {
          void this.app.workspace.getLeaf(false).openFile(file);
        }
        return;
      }
      this.selectDirectoryEntry(item.entry);
    });
  }

  private renderTagChips(container: HTMLElement, tags: string[]): void {
    if (tags.length === 0) {
      return;
    }
    const chips = container.createSpan({ cls: "memos-plus-quick-directory-result-tags" });
    for (const tag of tags.slice(0, 6)) {
      chips.createSpan({ cls: "memos-plus-tag", text: `#${tag}` });
    }
  }

  private scheduleDirectoryPreview(entry: QuickInputDirectoryEntry): void {
    const existing = this.previewTimers.get(entry.id);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.previewTimers.delete(entry.id);
      void this.loadDirectoryPreview(entry);
    }, 200);
    this.previewTimers.set(entry.id, timer);
  }

  private async loadDirectoryPreview(entry: QuickInputDirectoryEntry): Promise<void> {
    const memos = await this.getMemos();
    const preview = buildQuickInputDirectoryPreview(entry, this.plugin.settings, memos, {
      today: todayString(),
      limit: this.previewLimitFor(entry.id)
    });
    this.previewCache.set(entry.id, await this.withVaultPreview(entry, preview));
    if (this.selectedDirectoryId === entry.id) {
      void this.renderDirectoryArea();
    }
  }

  private async withVaultPreview(entry: QuickInputDirectoryEntry, preview: QuickInputDirectoryPreview): Promise<QuickInputDirectoryPreview> {
    const searches = collectQuickInputDirectoryVaultSearches(entry);
    if (searches.length === 0) {
      return preview;
    }
    const limit = this.previewLimitFor(entry.id);
    const fileItems: QuickInputPreviewItem[] = [];
    const seen = new Set<string>();
    let total = 0;
    for (const search of searches) {
      const results = await this.vaultSearchIndex.search(search, { today: todayString() }, {
        maxResults: limit,
        maxContentReads: Math.max(50, limit * 5)
      });
      for (const result of results) {
        if (seen.has(result.path)) {
          continue;
        }
        seen.add(result.path);
        total += 1;
        if (fileItems.length >= limit) {
          continue;
        }
        fileItems.push({
          type: "file",
          id: result.path,
          title: result.title,
          subtitle: result.path,
          path: result.path,
          tags: result.tags,
          modifiedTime: result.modifiedTime,
          excerpt: result.excerpt
        });
      }
    }
    return {
      items: [...fileItems, ...preview.items].slice(0, limit),
      total: total + preview.total
    };
  }

  private async getMemos(): Promise<MemoItem[]> {
    if (!this.memoCache) {
      this.memoCache = (await this.plugin.store.readDocument()).memos;
    }
    return this.memoCache;
  }

  private defaultPreviewLimit(): number {
    return Platform.isMobile ? this.plugin.settings.quickInputDirectoryMobileExpandedLimit : this.plugin.settings.quickInputDirectoryExpandedLimit;
  }

  private previewLimitFor(entryId: string): number {
    return this.previewLimits.get(entryId) ?? this.defaultPreviewLimit();
  }

  private clearDirectoryCache(): void {
    this.memoCache = null;
    this.previewCache.clear();
    this.previewLimits.clear();
    if (this.directoryContainerEl) {
      void this.renderDirectoryArea();
    }
  }

  private scheduleDirectoryRefresh(): void {
    this.memoCache = null;
    this.previewCache.clear();
    this.previewLimits.clear();
    this.clearDirectoryRefreshTimer();
    this.directoryRefreshTimer = setTimeout(() => {
      this.directoryRefreshTimer = null;
      if (this.directoryContainerEl) {
        void this.renderDirectoryArea();
      }
    }, 200);
  }

  private clearDirectoryRefreshTimer(): void {
    if (this.directoryRefreshTimer) {
      clearTimeout(this.directoryRefreshTimer);
      this.directoryRefreshTimer = null;
    }
  }

  private clearPreviewTimers(): void {
    for (const timer of this.previewTimers.values()) {
      clearTimeout(timer);
    }
    this.previewTimers.clear();
  }

  private createDirectoryGroup(): void {
    new SidebarGroupModal(this.app, {
      language: this.plugin.settings.language,
      onSubmit: async ({ title, icon }) => {
        this.plugin.settings.sidebarItems = insertSidebarItem(
          this.plugin.settings.sidebarItems,
          "",
          createSidebarGroup(createSidebarItemId("group"), title, icon)
        );
        await this.plugin.persistSettings();
        this.clearDirectoryCache();
      }
    }).open();
  }

  private async persistDraft(): Promise<void> {
    if (!this.plugin.settings.quickInputPreserveDraft) {
      this.plugin.settings.quickInputDraft = "";
      await this.plugin.persistSettings();
      return;
    }
    this.updateDraftFromComposer();
    await this.plugin.persistSettings();
  }

  private updateDraftFromComposer(): void {
    if (!this.composerSession) {
      return;
    }
    this.plugin.settings.quickInputDraft = this.composerSession.widget.getValue();
  }

  private async clearQuickInputDraft(): Promise<void> {
    if (!this.plugin.settings.quickInputDraft) {
      return;
    }
    this.plugin.settings.quickInputDraft = "";
    await this.plugin.persistSettings();
  }
}

export function shouldUseQuickInputModalFallback(): boolean {
  return Platform.isMobile;
}

function createSidebarItemId(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 7) || "item";
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}

function insertSidebarItem(items: SidebarItem[], parentGroupId: string, item: SidebarItem): SidebarItem[] {
  if (!parentGroupId) {
    return [...items, item];
  }
  return items.map((current) => {
    if (current.type !== "group") {
      return current;
    }
    if (current.id === parentGroupId) {
      return { ...current, children: [...current.children, item], collapsed: false };
    }
    return { ...current, children: insertSidebarItem(current.children, parentGroupId, item) };
  });
}

function formatPreviewDate(timestamp: number): string {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
