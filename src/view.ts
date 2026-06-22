import { ItemView, MarkdownRenderer, Menu, Notice, Platform, TFile, WorkspaceLeaf, getAllTags as getAllCacheTags, setIcon } from "obsidian";
import type MemosPlusPlugin from "../main";
import { createComposerSession, type ComposerSession } from "./composerSession";
import { filterMemos, getAllTags, todayString } from "./filter";
import type { MemoViewMode } from "./filter";
import { IconPickerModal } from "./iconPicker";
import { t, type Language } from "./i18n";
import type { MemoItem } from "./markdown";
import { applyMemoProjectTransferAfterAction, type MemoProjectTransferOutcome } from "./memoProjectTransfer";
import { EditMemoModal, QuickCaptureModal } from "./modal";
import {
  buildOrganizerPanelSections,
  buildOrganizerTaskBranchSections,
  createOrganizerMemoState,
  filterMemosForOrganizerFilter,
  isOrganizerTaskBranchId,
  organizerFilterLabelKey,
  type OrganizerFilterId
} from "./organizerPanel";
import { debounceDelay, effectivePageSize, PerformanceProfiler, shouldUseLightweightMode } from "./performance";
import { sendContentToProject, type ProjectDeliveryResult } from "./projectDelivery";
import {
  createSavedSearchId,
  filterMemosBySavedSearch,
  getSavedSearchTagOptions,
  savedSearchIncludesArchivedCondition,
  type SavedSearch
} from "./savedSearch";
import { SavedSearchModal } from "./savedSearchModal";
import { SidebarGroupModal } from "./sidebarGroupModal";
import {
  createSidebarGroup,
  createSidebarSearchItem,
  type SidebarGroupItem,
  type SidebarItem,
  type SidebarSearchItem
} from "./sidebar";
import { computeMemoStats } from "./stats";
import { filterTaskIndexItems, getTaskIndexOrganizerCounts, type TaskIndexItem, type TaskIndexStatus } from "./taskIndex";
import { resolveTemplateAfterTransferAction } from "./templateManager";
import { VaultSavedSearchIndex, type VaultSearchResult } from "./vaultSearch";
import { hasSidebarDirectoryModules, resolveViewLayoutDataNeeds, resolveViewLayoutModules, type DisplayModuleDataNeed, type DisplayModuleId } from "./displayModules";
import { logMemosPlusDiagnostic, setMemosPlusDiagnosticState } from "./diagnostics";

export const MEMOS_PLUS_VIEW_TYPE = "memos-plus-view";

interface ScrollPositionSnapshot {
  selector: ".memos-plus-main" | ".memos-plus-view";
  top: number;
  left: number;
}

interface ObsidianSettingApi {
  open?: () => void;
  openTabById?: (id: string) => void;
}

interface SidebarRenderOptions {
  showAllNotes?: boolean;
  showStats?: boolean;
  showHeatmap?: boolean;
  showOrganizer?: boolean;
  showTasks?: boolean;
  showCustomDirectory?: boolean;
}

export class MemosPlusView extends ItemView {
  private memos: MemoItem[] = [];
  private mode: MemoViewMode = "all";
  private query = "";
  private tag = "";
  private year = "";
  private activeSavedSearchId = "";
  private activeOrganizerSectionId: OrganizerFilterId | "" = "";
  private organizerTasksExpanded = false;
  private mobileLightFullWorkbench = false;
  private visibleCount = 50;
  private composerSession: ComposerSession | null = null;
  private timelineEl: HTMLElement | null = null;
  private timelineRenderTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly vaultSearchIndex: VaultSavedSearchIndex;
  private vaultSearchCacheKeys = new Map<string, string>();
  private vaultSearchResults = new Map<string, VaultSearchResult[]>();
  private readonly memoSearchCountCache = new Map<string, number>();
  private readonly memoSearchBaseCache = new Map<string, MemoItem[]>();
  private memoTagOptionsCache: string[] | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MemosPlusPlugin
  ) {
    super(leaf);
    logMemosPlusDiagnostic("view:constructor", { type: MEMOS_PLUS_VIEW_TYPE });
    this.vaultSearchIndex = new VaultSavedSearchIndex(this.app, this.plugin.vaultIndex);
    this.organizerTasksExpanded = this.plugin.settings.organizerTasksDefaultExpanded;
  }

  getViewType(): string {
    return MEMOS_PLUS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t(this.plugin.settings.language, "app.name");
  }

  getIcon(): string {
    return "message-square-plus";
  }

  async onOpen(): Promise<void> {
    logMemosPlusDiagnostic("view:onOpen", { type: MEMOS_PLUS_VIEW_TYPE });
    this.visibleCount = this.pageSize();
    await this.reload();
  }

  async onClose(): Promise<void> {
    logMemosPlusDiagnostic("view:onClose", { type: MEMOS_PLUS_VIEW_TYPE });
    this.cancelScheduledTimelineRender();
    this.composerSession?.destroy();
    this.composerSession = null;
    this.timelineEl = null;
  }

  async reload(options: { preserveScroll?: boolean } = {}): Promise<void> {
    logMemosPlusDiagnostic("view:refresh", {
      type: MEMOS_PLUS_VIEW_TYPE,
      preserveScroll: Boolean(options.preserveScroll)
    });
    const scrollPosition = options.preserveScroll ? this.captureMainScrollPosition() : null;
    const profiler = this.profiler();
    const dataNeeds = this.activeLayoutDataNeeds();
    if (dataNeeds.has("memos")) {
      const doc = await profiler.measure("load memos time", () => this.plugin.store.readDocument());
      this.memos = doc.memos;
    }
    await this.render();
    this.restoreMainScrollPosition(scrollPosition);
  }

  async render(): Promise<void> {
    logMemosPlusDiagnostic("view:render", { type: MEMOS_PLUS_VIEW_TYPE });
    logMemosPlusDiagnostic("view:render-start", { type: MEMOS_PLUS_VIEW_TYPE });
    setMemosPlusDiagnosticState({ isRendering: true });
    try {
      await this.profiler().measure("render view time", async () => {
        this.cancelScheduledTimelineRender();
        this.clearMemoSearchCaches();
        const container = this.containerEl.children[1];
        this.composerSession?.destroy();
        this.composerSession = null;
        this.timelineEl = null;
        container.empty();
        container.addClass("memos-plus-view");

        const shell = container.createDiv({ cls: this.shouldRenderMobileLightHome() ? "memos-plus-mobile-light-shell" : "memos-plus-shell" });
        if (this.shouldRenderMobileLightHome()) {
          await this.renderMobileLightHome(shell);
          return;
        }
        const homeModules = this.homeLayoutModules();
        if (this.shouldRenderDisplaySidebar(homeModules)) {
          this.renderSidebar(shell, this.sidebarOptionsForDisplayModules(homeModules));
        }
        await this.renderMain(shell, homeModules);
        this.renderMobileFab(shell);
      });
    } finally {
      logMemosPlusDiagnostic("view:render-end", { type: MEMOS_PLUS_VIEW_TYPE });
      setMemosPlusDiagnosticState({ isRendering: false });
    }
  }

  private renderSidebar(shell: Element, options: SidebarRenderOptions = {}): void {
    logMemosPlusDiagnostic("sidebar:render-start", { type: MEMOS_PLUS_VIEW_TYPE });
    const renderOptions = {
      showAllNotes: options.showAllNotes ?? true,
      showStats: options.showStats ?? true,
      showHeatmap: options.showHeatmap ?? true,
      showOrganizer: options.showOrganizer ?? true,
      showTasks: options.showTasks ?? true,
      showCustomDirectory: options.showCustomDirectory ?? true
    };
    const lang = this.plugin.settings.language;
    const today = todayString();
    const sidebar = shell.createDiv({ cls: "memos-plus-sidebar" });

    if (renderOptions.showStats) {
      const stats = this.profiler().measureSync("calculate stats time", () => computeMemoStats(this.memos, today));
      const statGrid = sidebar.createDiv({ cls: "memos-plus-stat-grid" });
      this.renderStat(statGrid, stats.total, t(lang, "meta.memos"));
      this.renderStat(statGrid, stats.tags, t(lang, "meta.tags"));
      this.renderStat(statGrid, stats.activeDays, t(lang, "meta.activeDays"));
      this.renderStat(statGrid, stats.today, t(lang, "meta.today"));
      this.renderStat(statGrid, stats.openTasks, t(lang, "meta.openTasks"));
    }

    if (renderOptions.showHeatmap) {
      this.renderHeatmap(sidebar);
    }
    if (renderOptions.showAllNotes) {
      const allSection = sidebar.createDiv({ cls: "memos-plus-sidebar-section memos-plus-sidebar-all-section" });
      const allRow = allSection.createDiv({ cls: "memos-plus-side-search-row memos-plus-side-all-row" });
      this.renderSidebarItem(allRow, {
        label: t(lang, "views.all"),
        icon: this.plugin.settings.allMemosIcon,
        count: this.countForView("all"),
        active: !this.activeSavedSearchId && !this.activeOrganizerSection() && this.mode === "all" && !this.year,
        onClick: () => this.selectView("all")
      });
      this.renderSidebarMoreAction(allRow, t(lang, "sidebar.more"), (event) => this.openAllMemosMenu(event));
    }
    if (renderOptions.showOrganizer || renderOptions.showTasks) {
      this.renderOrganizerDirectory(sidebar, {
        showSections: renderOptions.showOrganizer,
        showTasks: renderOptions.showTasks
      });
    }
    if (renderOptions.showCustomDirectory) {
      this.renderCustomDirectory(sidebar);
    }
    logMemosPlusDiagnostic("sidebar:render-end", { type: MEMOS_PLUS_VIEW_TYPE });
  }

  private async renderMain(shell: Element, modules: Set<DisplayModuleId> = this.homeLayoutModules()): Promise<void> {
    logMemosPlusDiagnostic("main:render-start", { type: MEMOS_PLUS_VIEW_TYPE });
    try {
      const lang = this.plugin.settings.language;
      const main = shell.createDiv({ cls: "memos-plus-main" });
      const header = main.createDiv({ cls: "memos-plus-main-header" });
      const titleWrap = header.createDiv();
      titleWrap.createDiv({ cls: "memos-plus-title", text: t(lang, "app.name") });
      titleWrap.createDiv({ cls: "memos-plus-subtitle", text: this.plugin.settings.memoFolderPath });

      const toolbar = this.renderHomeToolbar(header, modules);
      if (toolbar) {
        if (
          Platform.isMobile &&
          this.plugin.settings.mobilePerformanceMode &&
          this.plugin.settings.mobileLightHomeEnabled &&
          this.mobileLayoutMode() !== "full" &&
          this.mobileLightFullWorkbench
        ) {
          this.renderMobileLightCompactButton(toolbar);
        }
      }

      if (modules.has("quickInput")) {
        this.renderComposer(main);
      }
      await this.renderHomeResults(main, modules);
    } finally {
      logMemosPlusDiagnostic("main:render-end", { type: MEMOS_PLUS_VIEW_TYPE });
    }
  }

  private homeLayoutModules(): Set<DisplayModuleId> {
    return new Set(resolveViewLayoutModules(this.plugin.settings.homeLayout, "home"));
  }

  private activeLayoutDataNeeds(): Set<DisplayModuleDataNeed> {
    return new Set(
      this.shouldRenderMobileLightHome()
        ? resolveViewLayoutDataNeeds(this.plugin.settings.mobileLayout, "mobile")
        : resolveViewLayoutDataNeeds(this.plugin.settings.homeLayout, "home")
    );
  }

  private shouldRenderDisplaySidebar(modules: Set<DisplayModuleId>): boolean {
    return hasSidebarDirectoryModules(modules) || modules.has("statsCards") || modules.has("heatmap");
  }

  private sidebarOptionsForDisplayModules(modules: Set<DisplayModuleId>): SidebarRenderOptions {
    return {
      showAllNotes: modules.has("allNotes"),
      showStats: modules.has("statsCards"),
      showHeatmap: modules.has("heatmap"),
      showOrganizer: modules.has("organizeDirectory"),
      showTasks: modules.has("taskDirectory"),
      showCustomDirectory: modules.has("projectDirectory") || modules.has("projectFilters") || modules.has("tagFilters")
    };
  }

  private async renderMobileLightHome(shell: Element): Promise<void> {
    const lang = this.plugin.settings.language;
    const modules = this.mobileLayoutModules();
    const home = shell.createDiv({ cls: "memos-plus-mobile-light-home" });
    const header = home.createDiv({ cls: "memos-plus-mobile-light-header" });
    const titleWrap = header.createDiv({ cls: "memos-plus-mobile-light-title-wrap" });
    titleWrap.createDiv({ cls: "memos-plus-mobile-light-title", text: t(lang, "mobileLightHome.title") });
    titleWrap.createDiv({ cls: "memos-plus-mobile-light-subtitle", text: t(lang, "mobileLightHome.subtitle") });
    const full = header.createEl("button", {
      cls: "memos-plus-mobile-light-switch",
      attr: { type: "button", title: t(lang, "mobileLightHome.fullWorkbench") },
      text: t(lang, "mobileLightHome.fullWorkbench")
    });
    full.addEventListener("click", () => this.showFullWorkbench());

    if (this.shouldRenderDisplaySidebar(modules)) {
      this.renderSidebar(home, this.sidebarOptionsForDisplayModules(modules));
    }

    if (modules.has("quickInput")) {
      this.renderComposer(home);
    }
    if (modules.has("quickInput") && modules.has("sendButton") && this.plugin.settings.mobileLightHomeShowLaterButton) {
      const actions = home.createDiv({ cls: "memos-plus-mobile-light-actions" });
      const later = actions.createEl("button", { cls: "memos-plus-mobile-light-later", text: t(lang, "mobileLightHome.saveLater") });
      setIcon(later.createSpan({ cls: "memos-plus-mobile-light-button-icon" }), "inbox");
      later.addEventListener("click", () => {
        void this.composerSession?.actions.saveDefault();
      });
    }

    if (modules.has("fileList")) {
      await this.renderMobileHomeMemoList(home, modules);
    } else if (modules.has("fileCount")) {
      this.renderMobileHomeFileCount(home);
    }
  }

  private async renderMobileHomeMemoList(container: Element, modules: Set<DisplayModuleId>): Promise<void> {
    const listWrap = container.createDiv({ cls: "memos-plus-mobile-home-list memos-plus-main" });
    this.renderHomeToolbar(listWrap, modules, "memos-plus-mobile-home-toolbar");
    await this.renderHomeResults(listWrap, modules);
  }

  private async renderHomeResults(container: Element, modules: Set<DisplayModuleId>): Promise<void> {
    if (modules.has("fileList")) {
      this.timelineEl = container.createDiv({ cls: "memos-plus-timeline-region" });
      await this.renderTimeline(this.timelineEl);
      return;
    }
    if (modules.has("fileCount")) {
      this.renderHomeFileCount(container);
    }
  }

  private renderHomeToolbar(container: Element, modules: Set<DisplayModuleId>, extraClass = ""): HTMLElement | null {
    const lang = this.plugin.settings.language;
    if (!modules.has("searchBox") && !modules.has("settingsButton") && !modules.has("refreshButton")) {
      return null;
    }
    const toolbar = container.createDiv({ cls: ["memos-plus-toolbar", extraClass].filter(Boolean).join(" ") });
    if (modules.has("searchBox")) {
      const search = toolbar.createEl("input", {
        cls: "memos-plus-search",
        attr: { type: "search", placeholder: t(lang, "search.placeholder") }
      });
      search.value = this.query;
      search.addEventListener("input", () => {
        this.query = search.value;
        this.visibleCount = this.pageSize();
        this.scheduleTimelineRender();
      });
    }
    if (modules.has("settingsButton")) {
      const settingsButton = toolbar.createEl("button", {
        cls: "memos-plus-icon-button",
        attr: { "aria-label": t(lang, "settings.openMemosSettings"), title: t(lang, "settings.openMemosSettings") }
      });
      setIcon(settingsButton, "settings");
      settingsButton.addEventListener("click", () => this.openMemosSettings());
    }
    if (modules.has("refreshButton")) {
      const reload = toolbar.createEl("button", {
        cls: "memos-plus-icon-button",
        attr: { "aria-label": t(lang, "common.reload"), title: t(lang, "common.reload") }
      });
      setIcon(reload, "refresh-cw");
      reload.addEventListener("click", () => {
        void this.reload();
      });
    }
    return toolbar;
  }

  private renderMobileHomeFileCount(container: Element): void {
    const meta = container.createDiv({ cls: "memos-plus-mobile-home-list memos-plus-main" });
    this.renderHomeFileCount(meta);
  }

  private renderHomeFileCount(container: Element): void {
    const filtered = this.currentFilteredMemos();
    const line = container.createDiv({ cls: "memos-plus-list-meta" });
    line.createSpan({ text: `${filtered.length} ${t(this.plugin.settings.language, "meta.memos")}` });
  }

  private showFullWorkbench(): void {
    this.mobileLightFullWorkbench = true;
    void this.render();
  }

  private renderMobileLightCompactButton(toolbar: Element): void {
    const lang = this.plugin.settings.language;
    const compact = toolbar.createEl("button", {
      cls: "memos-plus-icon-button",
      attr: { "aria-label": t(lang, "mobileLightHome.compactHome"), title: t(lang, "mobileLightHome.compactHome") }
    });
    setIcon(compact, "smartphone");
    compact.addEventListener("click", () => {
      this.mobileLightFullWorkbench = false;
      void this.render();
    });
  }

  private openMemosSettings(): void {
    const setting = (this.app as unknown as { setting?: ObsidianSettingApi }).setting;
    setting?.open?.();
    setting?.openTabById?.(this.plugin.manifest.id);
  }

  private shouldRenderMobileLightHome(): boolean {
    return (
      Platform.isMobile &&
      this.plugin.settings.mobilePerformanceMode &&
      this.plugin.settings.mobileLightHomeEnabled &&
      this.mobileLayoutMode() !== "full" &&
      !this.mobileLightFullWorkbench
    );
  }

  private mobileLayoutMode(): string {
    return this.plugin.settings.mobileLayout.mode;
  }

  private mobileLayoutModules(): Set<DisplayModuleId> {
    return new Set(resolveViewLayoutModules(this.plugin.settings.mobileLayout, "mobile"));
  }

  private scheduleTimelineRender(): void {
    this.cancelScheduledTimelineRender();
    this.timelineRenderTimer = setTimeout(() => {
      this.timelineRenderTimer = null;
      void this.renderTimelineOnly();
    }, debounceDelay(this.plugin.settings, Platform.isMobile));
  }

  private cancelScheduledTimelineRender(): void {
    if (!this.timelineRenderTimer) {
      return;
    }
    clearTimeout(this.timelineRenderTimer);
    this.timelineRenderTimer = null;
  }

  private async renderTimelineOnly(): Promise<void> {
    if (!this.timelineEl) {
      await this.render();
      return;
    }
    await this.renderTimeline(this.timelineEl);
  }

  private renderComposer(main: Element): void {
    this.composerSession = createComposerSession({
      app: this.app,
      parent: main,
      settings: this.plugin.settings,
      store: this.plugin.store,
      persistSettings: () => this.plugin.persistSettings(),
      refreshViews: () => this.reload(),
      registerCleanup: (cleanup) => this.register(cleanup),
      resolveMarkdownLink: (text) => this.plugin.resolveMarkdownLink(text)
    });
  }

  private async renderTimeline(main: Element): Promise<void> {
    await this.profiler().measure("render memo list time", async () => {
      main.empty();
      const lang = this.plugin.settings.language;
      const savedSearch = this.activeSavedSearch();
      if (savedSearch && savedSearch.searchScope === "vault") {
        await this.ensureVaultSearchCache(savedSearch);
        this.renderVaultSearchResults(main, savedSearch);
        return;
      }
      const organizerSection = this.activeOrganizerSection();
      if (this.shouldUseTaskIndexForOrganizer(organizerSection)) {
        this.renderTaskIndexResults(main, organizerSection);
        return;
      }
      const filtered = this.currentFilteredMemos();
      const shown = filtered.slice(0, this.visibleCount);

      const meta = main.createDiv({ cls: "memos-plus-list-meta" });
      meta.createSpan({ text: `${filtered.length} ${t(lang, "meta.memos")}` });
      if (this.year) {
        meta.createSpan({ text: this.year });
      }
      if (savedSearch) {
        meta.createSpan({ text: savedSearch.name });
      }
      if (this.tag) {
        meta.createSpan({ text: `#${this.tag}` });
      }
      if (organizerSection) {
        meta.createSpan({ text: t(lang, organizerFilterLabelKey(organizerSection)) });
      }

      const tagRow = main.createDiv({ cls: "memos-plus-tag-filter-row" });
      const tagSelect = tagRow.createEl("select", { cls: "memos-plus-tag-select" });
      tagSelect.createEl("option", { text: t(lang, "filters.allTags"), value: "" });
      for (const tag of this.memoTagOptions()) {
        tagSelect.createEl("option", { text: `#${tag}`, value: tag });
      }
      tagSelect.value = this.tag;
      tagSelect.addEventListener("change", () => {
        this.tag = tagSelect.value;
        this.visibleCount = this.pageSize();
        void this.renderTimelineOnly();
      });

      const list = main.createDiv({ cls: "memos-plus-list" });
      if (shown.length === 0) {
        list.createDiv({ cls: "memos-plus-empty", text: t(lang, "empty.noMemos") });
        return;
      }

      for (const memo of shown) {
        await this.renderCard(list, memo);
      }

      if (shown.length < filtered.length) {
        const more = main.createEl("button", { cls: "memos-plus-load-more", text: `${filtered.length - shown.length}` });
        more.addEventListener("click", () => {
          this.visibleCount += this.pageSize();
          void this.renderTimelineOnly();
        });
      }
    });
  }

  private async renderCard(list: Element, memo: MemoItem): Promise<void> {
    const lang = this.plugin.settings.language;
    const card = list.createDiv({ cls: `memos-plus-card${memo.isArchived ? " is-archived" : ""}` });
    const header = card.createDiv({ cls: "memos-plus-card-header" });
    header.createDiv({ cls: "memos-plus-card-time", text: `${memo.date} ${memo.time}` });
    const actions = header.createDiv({ cls: "memos-plus-card-actions" });
    this.renderMemoMoreAction(actions, t(lang, "memo.more"), (event) => this.openMemoActionMenu(event, memo));

    const body = card.createDiv({ cls: "memos-plus-card-body" });
    await MarkdownRenderer.render(this.app, memo.content, body, memo.filePath, this);
    this.wireTaskCheckboxes(body, memo);

    if (memo.tags.length > 0) {
      const tags = card.createDiv({ cls: "memos-plus-card-tags" });
      for (const tag of memo.tags) {
        const chip = tags.createEl("button", { cls: "memos-plus-tag-chip", text: `#${tag}` });
        chip.addEventListener("click", () => {
          this.tag = tag;
          this.activeOrganizerSectionId = "";
          void this.render();
        });
      }
    }
  }

  private renderOrganizerDirectory(sidebar: Element, options: { showSections?: boolean; showTasks?: boolean } = {}): void {
    const settings = this.plugin.settings;
    if (!settings.organizerPanelEnabled) {
      return;
    }
    const showSections = options.showSections ?? true;
    const showTasks = options.showTasks ?? true;
    if (!showSections && !showTasks) {
      return;
    }
    const lang = settings.language;
    const today = todayString();
    const sections = buildOrganizerPanelSections(this.memos, {
      today,
      states: settings.organizerMemoStates,
      sectionSettings: settings.organizerPanelSections,
      limit: 0
    }).filter((section) => (section.id === "tasks" ? showTasks : showSections));
    const taskBranches = showTasks
      ? buildOrganizerTaskBranchSections(this.memos, {
          today,
          showPriorityBranches: settings.organizerTaskPriorityBranchesEnabled,
          showDateBranches: settings.organizerTaskDateBranchesEnabled,
          limit: 0
        })
      : [];
    const useTaskIndex = showTasks && settings.taskVaultFilterEnabled && settings.taskIndexEnabled;
    const taskIndexCounts = useTaskIndex ? getTaskIndexOrganizerCounts(this.plugin.taskIndex.getItems(), today) : null;
    const taskIndexStatus = useTaskIndex ? this.plugin.taskIndex.getStatus() : null;
    if (sections.length === 0) {
      return;
    }
    const directorySection = sidebar.createDiv({ cls: "memos-plus-sidebar-section memos-plus-directory-section memos-plus-organizer-directory-section" });
    const header = directorySection.createDiv({ cls: "memos-plus-directory-header" });
    header.createSpan({ cls: "memos-plus-directory-title", text: t(lang, "organizer.directory") });
    for (const section of sections) {
      const row = directorySection.createDiv({ cls: "memos-plus-side-search-row memos-plus-organizer-directory-row" });
      if (section.id === "tasks" && taskBranches.length > 0) {
        this.renderOrganizerTaskToggle(row);
      }
      this.renderSidebarItem(row, {
        label: t(lang, section.labelKey),
        icon: section.icon,
        count: section.id === "tasks" && taskIndexCounts ? this.formatTaskIndexCount(taskIndexCounts.tasks, taskIndexStatus) : section.total,
        active: this.activeOrganizerSection() === section.id,
        onClick: () => this.selectOrganizerSection(section.id)
      });
      if (section.id === "tasks" && this.organizerTasksExpanded) {
        for (const branch of taskBranches) {
          const branchRow = directorySection.createDiv({
            cls: "memos-plus-side-search-row memos-plus-organizer-directory-row memos-plus-organizer-task-branch-row"
          });
          this.renderSidebarItem(branchRow, {
            label: t(lang, branch.labelKey),
            icon: branch.icon,
            count:
              taskIndexCounts && isOrganizerTaskBranchId(branch.id)
                ? this.formatTaskIndexCount(taskIndexCounts[branch.id], taskIndexStatus)
                : branch.total,
            active: this.activeOrganizerSection() === branch.id,
            depth: 1,
            onClick: () => this.selectOrganizerSection(branch.id)
          });
        }
      }
    }
  }

  private renderOrganizerTaskToggle(container: Element): void {
    const lang = this.plugin.settings.language;
    const expanded = this.organizerTasksExpanded;
    const toggle = container.createEl("button", {
      cls: "memos-plus-side-action memos-plus-organizer-task-toggle",
      attr: {
        type: "button",
        "aria-label": t(lang, expanded ? "organizer.collapse" : "organizer.expand"),
        title: t(lang, expanded ? "organizer.collapse" : "organizer.expand"),
        "aria-expanded": String(expanded)
      }
    });
    setIcon(toggle, expanded ? "chevron-down" : "chevron-right");
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.organizerTasksExpanded = !this.organizerTasksExpanded;
      if (!this.organizerTasksExpanded && isOrganizerTaskBranchId(this.activeOrganizerSectionId)) {
        this.activeOrganizerSectionId = "tasks";
      }
      void this.render();
    });
  }

  private renderStat(container: Element, value: number, label: string): void {
    const item = container.createDiv({ cls: "memos-plus-stat" });
    item.createDiv({ cls: "memos-plus-stat-value", text: String(value) });
    item.createDiv({ cls: "memos-plus-stat-label", text: label });
  }

  private renderHeatmap(container: Element): void {
    if (this.plugin.settings.performanceSafeMode) {
      return;
    }
    const days = recentDays(shouldUseLightweightMode(this.plugin.settings, Platform.isMobile) ? 60 : 70);
    const counts = new Map<string, number>();
    for (const memo of this.memos) {
      counts.set(memo.date, (counts.get(memo.date) ?? 0) + 1);
    }
    const heatmap = container.createDiv({ cls: "memos-plus-heatmap" });
    for (const day of days) {
      const count = counts.get(day) ?? 0;
      const cell = heatmap.createDiv({ cls: `memos-plus-heat-cell level-${Math.min(count, 4)}` });
      cell.setAttr("title", `${day}: ${count}`);
    }
  }

  private renderCustomDirectory(container: Element): void {
    const lang = this.plugin.settings.language;
    const directorySection = container.createDiv({ cls: "memos-plus-sidebar-section memos-plus-directory-section" });
    const header = directorySection.createDiv({ cls: "memos-plus-directory-header" });
    header.createSpan({ cls: "memos-plus-directory-title", text: t(lang, "sidebar.directory") });
    const add = header.createEl("button", {
      cls: "memos-plus-directory-add",
      attr: { type: "button", "aria-label": t(lang, "sidebar.addTop"), title: t(lang, "sidebar.addTop") }
    });
    setIcon(add, "plus");
    add.addEventListener("click", () => this.createGroup(""));

    if (this.plugin.settings.sidebarItems.length === 0) {
      directorySection.createDiv({ cls: "memos-plus-sidebar-empty", text: t(lang, "sidebar.noItems") });
      return;
    }
    for (const item of this.plugin.settings.sidebarItems) {
      this.renderSidebarTreeItem(directorySection, item, 0);
    }
  }

  private renderSidebarTreeItem(container: Element, item: SidebarItem, depth: number): void {
    if (item.type === "group") {
      this.renderSidebarGroup(container, item, depth);
      return;
    }
    this.renderSidebarSearch(container, item, depth);
  }

  private renderSidebarGroup(container: Element, group: SidebarGroupItem, depth: number): void {
    const lang = this.plugin.settings.language;
    const row = container.createDiv({ cls: "memos-plus-side-search-row memos-plus-side-group-row" });
    this.renderSidebarItem(row, {
      label: group.title,
      icon: group.collapsed ? "folder-closed" : group.icon,
      count: this.countForGroup(group),
      active: false,
      depth,
      onClick: () => {
        this.plugin.settings.sidebarItems = updateSidebarItem(this.plugin.settings.sidebarItems, { ...group, collapsed: !group.collapsed });
        void this.plugin.saveSettings().then(() => this.render());
      }
    });
    this.renderSidebarMoreAction(row, t(lang, "sidebar.more"), (event) => this.openSidebarGroupMenu(event, group));

    if (group.collapsed) {
      return;
    }
    for (const child of group.children) {
      this.renderSidebarTreeItem(container, child, depth + 1);
    }
  }

  private renderSidebarSearch(container: Element, item: SidebarSearchItem, depth: number): void {
    const lang = this.plugin.settings.language;
    const search = this.findSavedSearch(item.searchId);
    const row = container.createDiv({ cls: "memos-plus-side-search-row" });
    this.renderSidebarItem(row, {
      label: item.title,
      icon: item.icon,
      count: search ? this.countForSavedSearch(search) : 0,
      active: this.activeSavedSearchId === item.searchId,
      depth,
      onClick: () => this.selectSavedSearch(item.searchId)
    });
    this.renderSidebarMoreAction(row, t(lang, "sidebar.more"), (event) => this.openSidebarSearchMenu(event, item, search));
  }

  private renderSidebarItem(
    container: Element,
    item: { label: string; icon: string; count: number | string; active: boolean; onClick: () => void; depth?: number }
  ): void {
    container.addClass(item.active ? "is-active" : "is-inactive");
    const button = container.createEl("button", { cls: "memos-plus-side-item" });
    if (item.depth) {
      button.style.setProperty("--memos-plus-depth", String(item.depth));
    }
    const iconEl = button.createSpan({ cls: "memos-plus-side-icon" });
    setIcon(iconEl, item.icon);
    button.createSpan({ cls: "memos-plus-side-label", text: item.label });
    button.createSpan({ cls: "memos-plus-side-count", text: String(item.count) });
    button.addEventListener("click", item.onClick);
  }

  private renderSidebarMoreAction(container: Element, label: string, onClick: (event: MouseEvent) => void): void {
    const action = container.createEl("button", {
      cls: "memos-plus-side-action memos-plus-side-more",
      attr: { type: "button", "aria-label": label, title: label }
    });
    setIcon(action, "more-horizontal");
    action.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    });
  }

  private selectView(mode: MemoViewMode): void {
    this.mode = mode;
    this.year = "";
    this.activeSavedSearchId = "";
    this.activeOrganizerSectionId = "";
    this.visibleCount = this.pageSize();
    void this.render();
  }

  private selectSavedSearch(id: string): void {
    this.mode = "all";
    this.year = "";
    this.activeSavedSearchId = id;
    this.activeOrganizerSectionId = "";
    this.visibleCount = this.pageSize();
    void this.render();
  }

  private selectOrganizerSection(id: OrganizerFilterId): void {
    this.mode = "all";
    this.year = "";
    this.tag = "";
    this.activeSavedSearchId = "";
    this.activeOrganizerSectionId = id;
    if (isOrganizerTaskBranchId(id)) {
      this.organizerTasksExpanded = true;
    }
    this.visibleCount = this.pageSize();
    void this.render();
  }

  private openSidebarGroupMenu(event: MouseEvent, group: SidebarGroupItem): void {
    const lang = this.plugin.settings.language;
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(t(lang, "sidebar.addSearch"))
        .setIcon("filter")
        .onClick(() => this.openSavedSearchModal(undefined, undefined, group.id));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "sidebar.addGroup"))
        .setIcon("folder-plus")
        .onClick(() => void this.createGroup(group.id));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(t(lang, "sidebar.rename"))
        .setIcon("pencil")
        .onClick(() => this.renameGroup(group));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "sidebar.pinToTop"))
        .setIcon("pin")
        .onClick(() => void this.moveSidebarItemToTop(group.id));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "sidebar.copy"))
        .setIcon("copy")
        .onClick(() => void this.duplicateGroup(group));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "sidebar.moveUp"))
        .setIcon("arrow-up")
        .onClick(() => void this.moveSidebarItem(group.id, "up"));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "sidebar.moveDown"))
        .setIcon("arrow-down")
        .onClick(() => void this.moveSidebarItem(group.id, "down"));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "common.delete"))
        .setIcon("trash-2")
        .onClick(() => void this.deleteSidebarGroup(group));
    });
    menu.showAtMouseEvent(event);
  }

  private openAllMemosMenu(event: MouseEvent): void {
    const lang = this.plugin.settings.language;
    const menu = new Menu();
    menu.addItem((menuItem) => {
      menuItem.setTitle(t(lang, "iconPicker.choose"))
        .setIcon("palette")
        .onClick(() => this.openAllMemosIconPicker());
    });
    menu.showAtMouseEvent(event);
  }

  private openAllMemosIconPicker(): void {
    new IconPickerModal(this.app, {
      language: this.plugin.settings.language,
      selectedIcon: this.plugin.settings.allMemosIcon,
      onChoose: (icon) => {
        this.plugin.settings.allMemosIcon = icon;
        void this.plugin.saveSettings().then(() => this.render());
      }
    }).open();
  }

  private openSidebarSearchMenu(event: MouseEvent, item: SidebarSearchItem, search?: SavedSearch): void {
    const lang = this.plugin.settings.language;
    const menu = new Menu();
    if (search) {
      menu.addItem((menuItem) => {
        menuItem.setTitle(t(lang, "common.edit"))
          .setIcon("pencil")
          .onClick(() => this.openSavedSearchModal(search, item));
      });
      menu.addItem((menuItem) => {
        menuItem.setTitle(t(lang, "sidebar.pinToTop"))
          .setIcon("pin")
          .onClick(() => void this.moveSidebarItemToTop(item.id));
      });
      menu.addItem((menuItem) => {
        menuItem.setTitle(t(lang, "sidebar.copy"))
          .setIcon("copy")
          .onClick(() => void this.duplicateSearchItem(item, search));
      });
      menu.addSeparator();
    }
    menu.addItem((menuItem) => {
      menuItem.setTitle(t(lang, "sidebar.moveUp"))
        .setIcon("arrow-up")
        .onClick(() => void this.moveSidebarItem(item.id, "up"));
    });
    menu.addItem((menuItem) => {
      menuItem.setTitle(t(lang, "sidebar.moveDown"))
        .setIcon("arrow-down")
        .onClick(() => void this.moveSidebarItem(item.id, "down"));
    });
    menu.addItem((menuItem) => {
      menuItem.setTitle(t(lang, "common.delete"))
        .setIcon("trash-2")
        .onClick(() => void this.deleteSidebarSearch(item));
    });
    menu.showAtMouseEvent(event);
  }

  private async createGroup(parentGroupId: string): Promise<void> {
    new SidebarGroupModal(this.app, {
      language: this.plugin.settings.language,
      onSubmit: async ({ title, icon }) => {
        const group = createSidebarGroup(createSidebarItemId("group"), title, icon);
        this.plugin.settings.sidebarItems = insertSidebarItem(this.plugin.settings.sidebarItems, parentGroupId, group);
        await this.plugin.saveSettings();
        await this.render();
      }
    }).open();
  }

  private renameGroup(group: SidebarGroupItem): void {
    new SidebarGroupModal(this.app, {
      language: this.plugin.settings.language,
      initialTitle: group.title,
      initialIcon: group.icon,
      onSubmit: async ({ title, icon }) => {
        this.plugin.settings.sidebarItems = updateSidebarItem(this.plugin.settings.sidebarItems, { ...group, title, icon });
        await this.plugin.saveSettings();
        await this.render();
      }
    }).open();
  }

  private async duplicateSearchItem(item: SidebarSearchItem, search: SavedSearch): Promise<void> {
    const nextSearch: SavedSearch = {
      ...search,
      id: createSavedSearchId(),
      name: `${search.name} copy`,
      conditions: search.conditions.map((condition) => ({ ...condition }))
    };
    const nextItem = createSidebarSearchItem(createSidebarItemId("item"), `${item.title} copy`, item.icon, nextSearch.id);
    this.plugin.settings.savedSearches = [...this.plugin.settings.savedSearches, nextSearch];
    this.plugin.settings.sidebarItems = insertSidebarItemAfter(this.plugin.settings.sidebarItems, item.id, nextItem);
    await this.plugin.saveSettings();
    await this.render();
  }

  private async duplicateGroup(group: SidebarGroupItem): Promise<void> {
    const copies: SavedSearch[] = [];
    const clone = cloneSidebarGroup(group, this.plugin.settings.savedSearches, copies);
    this.plugin.settings.savedSearches = [...this.plugin.settings.savedSearches, ...copies];
    this.plugin.settings.sidebarItems = insertSidebarItemAfter(this.plugin.settings.sidebarItems, group.id, clone);
    await this.plugin.saveSettings();
    await this.render();
  }

  private async moveSidebarItem(id: string, direction: "up" | "down"): Promise<void> {
    this.plugin.settings.sidebarItems = moveSidebarItemInTree(this.plugin.settings.sidebarItems, id, direction);
    await this.plugin.saveSettings();
    await this.render();
  }

  private async moveSidebarItemToTop(id: string): Promise<void> {
    this.plugin.settings.sidebarItems = moveSidebarItemToTopInTree(this.plugin.settings.sidebarItems, id);
    await this.plugin.saveSettings();
    await this.render();
  }

  private async deleteSidebarSearch(item: SidebarSearchItem): Promise<void> {
    const lang = this.plugin.settings.language;
    if (!window.confirm(t(lang, "sidebar.deleteSearchConfirm").replace("{name}", item.title))) {
      return;
    }
    const nextItems = removeSidebarItem(this.plugin.settings.sidebarItems, item.id);
    this.plugin.settings.sidebarItems = nextItems;
    if (!collectSidebarSearchIds(nextItems).has(item.searchId)) {
      this.plugin.settings.savedSearches = this.plugin.settings.savedSearches.filter((search) => search.id !== item.searchId);
    }
    if (this.activeSavedSearchId === item.searchId) {
      this.activeSavedSearchId = "";
    }
    await this.plugin.saveSettings();
    await this.render();
  }

  private async deleteSidebarGroup(group: SidebarGroupItem): Promise<void> {
    const lang = this.plugin.settings.language;
    if (!window.confirm(t(lang, "sidebar.deleteGroupConfirm").replace("{name}", group.title))) {
      return;
    }
    const removedSearchIds = collectSidebarSearchIds([group]);
    const nextItems = removeSidebarItem(this.plugin.settings.sidebarItems, group.id);
    const remainingSearchIds = collectSidebarSearchIds(nextItems);
    this.plugin.settings.sidebarItems = nextItems;
    this.plugin.settings.savedSearches = this.plugin.settings.savedSearches.filter(
      (search) => !removedSearchIds.has(search.id) || remainingSearchIds.has(search.id)
    );
    if (this.activeSavedSearchId && removedSearchIds.has(this.activeSavedSearchId) && !remainingSearchIds.has(this.activeSavedSearchId)) {
      this.activeSavedSearchId = "";
    }
    await this.plugin.saveSettings();
    await this.render();
  }

  private countForView(mode: MemoViewMode): number {
    return filterMemos(this.memos, {
      view: mode,
      today: todayString(),
      showArchived: this.plugin.settings.showArchived,
      sortOrder: this.plugin.settings.sortOrder
    }).length;
  }

  private shouldDeferSidebarCounts(): boolean {
    return shouldUseLightweightMode(this.plugin.settings, Platform.isMobile);
  }

  private pageSize(): number {
    return effectivePageSize(this.plugin.settings, Platform.isMobile);
  }

  private profiler(): PerformanceProfiler {
    return new PerformanceProfiler(this.plugin.settings.performanceDebugMode);
  }

  private currentFilteredMemos(): MemoItem[] {
    const savedSearch = this.activeSavedSearch();
    if (savedSearch && savedSearch.searchScope === "vault") {
      return [];
    }
    const filtered = filterMemos(this.memos, {
      view: this.mode,
      today: todayString(),
      query: this.query,
      tag: this.tag,
      year: this.year,
      showArchived: savedSearch ? this.shouldShowArchivedForSavedSearch(savedSearch) : this.plugin.settings.showArchived,
      sortOrder: this.plugin.settings.sortOrder
    });
    const searched = savedSearch ? filterMemosBySavedSearch(filtered, savedSearch, { today: todayString() }) : filtered;
    const organizerSection = this.activeOrganizerSection();
    return organizerSection
      ? filterMemosForOrganizerFilter(organizerSection, searched, {
          today: todayString(),
          states: this.plugin.settings.organizerMemoStates
        })
      : searched;
  }

  private activeOrganizerSection(): OrganizerFilterId | "" {
    return this.plugin.settings.organizerPanelEnabled ? this.activeOrganizerSectionId : "";
  }

  private memoTagOptions(): string[] {
    if (this.memoTagOptionsCache) {
      return this.memoTagOptionsCache;
    }
    const tags = getAllTags(this.memos);
    this.memoTagOptionsCache = tags;
    return tags;
  }

  private countForSavedSearch(search: SavedSearch): number | string {
    if (this.shouldDeferSidebarCounts()) {
      return "…";
    }
    if (search.searchScope === "vault") {
      return this.vaultSearchResults.get(search.id)?.length ?? "…";
    }
    const cacheKey = this.memoSearchCountKey(search);
    const cached = this.memoSearchCountCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const count = filterMemosBySavedSearch(this.memoSearchBaseFor(search), search, { today: todayString() }).length;
    this.memoSearchCountCache.set(cacheKey, count);
    return count;
  }

  private shouldUseTaskIndexForOrganizer(filterId: OrganizerFilterId | ""): filterId is OrganizerFilterId {
    return (
      this.plugin.settings.taskVaultFilterEnabled &&
      this.plugin.settings.taskIndexEnabled &&
      (filterId === "tasks" || isOrganizerTaskBranchId(filterId))
    );
  }

  private formatTaskIndexCount(count: number, status: TaskIndexStatus | null): number | string {
    if (!status || status.updating || !status.updatedAt) {
      return "…";
    }
    return count;
  }

  private memoSearchBaseFor(search: SavedSearch): MemoItem[] {
    const cacheKey = this.memoSearchBaseKey(search);
    const cached = this.memoSearchBaseCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const base = filterMemos(this.memos, {
      view: "all",
      today: todayString(),
      showArchived: this.shouldShowArchivedForSavedSearch(search),
      sortOrder: this.plugin.settings.sortOrder
    });
    this.memoSearchBaseCache.set(cacheKey, base);
    return base;
  }

  private memoSearchCountKey(search: SavedSearch): string {
    return JSON.stringify({
      id: search.id,
      match: search.match,
      conditions: search.conditions,
      today: todayString(),
      showArchived: this.shouldShowArchivedForSavedSearch(search),
      sortOrder: this.plugin.settings.sortOrder,
      memoCount: this.memos.length
    });
  }

  private memoSearchBaseKey(search: SavedSearch): string {
    return JSON.stringify({
      today: todayString(),
      showArchived: this.shouldShowArchivedForSavedSearch(search),
      sortOrder: this.plugin.settings.sortOrder,
      memoCount: this.memos.length
    });
  }

  private clearMemoSearchCaches(): void {
    this.memoSearchCountCache.clear();
    this.memoSearchBaseCache.clear();
    this.memoTagOptionsCache = null;
  }

  private shouldShowArchivedForSavedSearch(search: SavedSearch): boolean {
    return this.plugin.settings.showArchived || savedSearchIncludesArchivedCondition(search);
  }

  private activeSavedSearch(): SavedSearch | undefined {
    return this.plugin.settings.savedSearches.find((search) => search.id === this.activeSavedSearchId);
  }

  private findSavedSearch(id: string): SavedSearch | undefined {
    return this.plugin.settings.savedSearches.find((search) => search.id === id);
  }

  private openSavedSearchModal(search?: SavedSearch, item?: SidebarSearchItem, parentGroupId = ""): void {
    new SavedSearchModal(this.app, {
      language: this.plugin.settings.language,
      memos: this.memos,
      tagOptions: getSavedSearchTagOptions(this.memos, this.vaultTagCounts()),
      groups: collectSidebarGroups(this.plugin.settings.sidebarItems),
      initialIcon: item?.icon,
      initialGroupId: item ? findSidebarParentId(this.plugin.settings.sidebarItems, item.id) : parentGroupId,
      initialSearch: search,
      searchVault: (nextSearch) => this.vaultSearchIndex.search(nextSearch, { today: todayString() }),
      onSubmit: async (next, meta) => {
        const savedSearches = [...this.plugin.settings.savedSearches];
        const index = savedSearches.findIndex((item) => item.id === next.id);
        if (index >= 0) {
          savedSearches[index] = next;
        } else {
          savedSearches.push(next);
        }
        this.plugin.settings.savedSearches = savedSearches;
        if (item) {
          const nextItem = { ...item, title: meta.title, icon: meta.icon };
          const currentParent = findSidebarParentId(this.plugin.settings.sidebarItems, item.id);
          const updated = updateSidebarItem(this.plugin.settings.sidebarItems, nextItem);
          this.plugin.settings.sidebarItems = currentParent === meta.groupId ? updated : insertSidebarItem(removeSidebarItem(updated, item.id), meta.groupId, nextItem);
        } else {
          this.plugin.settings.sidebarItems = insertSidebarItem(
            this.plugin.settings.sidebarItems,
            meta.groupId,
            createSidebarSearchItem(createSidebarItemId("item"), meta.title, meta.icon, next.id)
          );
        }
        this.activeSavedSearchId = next.id;
        await this.plugin.saveSettings();
        await this.render();
      }
    }).open();
  }

  private countForGroup(group: SidebarGroupItem): number | string {
    if (this.shouldDeferSidebarCounts()) {
      return "…";
    }
    let total = 0;
    for (const item of group.children) {
      if (item.type === "group") {
        const childCount = this.countForGroup(item);
        if (typeof childCount !== "number") {
          return "…";
        }
        total += childCount;
        continue;
      }
      const search = this.findSavedSearch(item.searchId);
      const count = search ? this.countForSavedSearch(search) : 0;
      if (typeof count !== "number") {
        return "…";
      }
      total += count;
    }
    return total;
  }

  private vaultTagCounts(): Record<string, number> {
    const tags: Record<string, number> = {};
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) {
        continue;
      }
      for (const tag of getAllCacheTags(cache) ?? []) {
        tags[tag] = (tags[tag] ?? 0) + 1;
      }
    }
    return tags;
  }

  private async ensureVaultSearchCache(search: SavedSearch): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const key = JSON.stringify({
      search: { id: search.id, match: search.match, conditions: search.conditions },
      files: files.map((file) => [file.path, file.stat?.mtime ?? 0])
    });
    if (key === this.vaultSearchCacheKeys.get(search.id)) {
      return;
    }
    const results = await this.profiler().measure("build vault index time", () => this.vaultSearchIndex.search(search, { today: todayString() }));
    this.vaultSearchResults.set(search.id, results);
    this.vaultSearchCacheKeys.set(search.id, key);
  }

  private renderVaultSearchResults(main: Element, savedSearch: SavedSearch): void {
    const lang = this.plugin.settings.language;
    const allResults = this.vaultSearchResults.get(savedSearch.id) ?? [];
    const query = this.query.trim().toLowerCase();
    const filtered = query
      ? allResults.filter((result) => `${result.title} ${result.path} ${result.excerpt} ${result.tags.join(" ")}`.toLowerCase().includes(query))
      : allResults;
    const shown = filtered.slice(0, this.visibleCount);

    const meta = main.createDiv({ cls: "memos-plus-list-meta" });
    meta.createSpan({ text: `${filtered.length} ${t(lang, "vaultSearch.files")}` });
    meta.createSpan({ text: savedSearch.name });

    const list = main.createDiv({ cls: "memos-plus-list memos-plus-vault-results" });
    if (shown.length === 0) {
      list.createDiv({ cls: "memos-plus-empty", text: t(lang, "savedSearch.noVaultPreview") });
      return;
    }

    for (const result of shown) {
      const card = list.createDiv({ cls: "memos-plus-card memos-plus-vault-result" });
      card.setAttr("role", "button");
      card.setAttr("tabindex", "0");
      card.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(result.file);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void this.app.workspace.getLeaf(false).openFile(result.file);
        }
      });
      const header = card.createDiv({ cls: "memos-plus-card-header" });
      header.createDiv({ cls: "memos-plus-card-time", text: formatDateTime(result.modifiedTime) });
      const body = card.createDiv({ cls: "memos-plus-card-body" });
      body.createDiv({ cls: "memos-plus-vault-result-title", text: result.title });
      body.createDiv({ cls: "memos-plus-vault-result-path", text: result.path });
      if (result.task) {
        body.createDiv({ cls: "memos-plus-vault-result-task", text: result.task.text });
        body.createDiv({ cls: "memos-plus-vault-result-excerpt", text: formatVaultTaskSummary(result.task, lang) });
      } else if (result.excerpt) {
        body.createDiv({ cls: "memos-plus-vault-result-excerpt", text: result.excerpt });
      }
      if (result.tags.length > 0) {
        const tags = card.createDiv({ cls: "memos-plus-card-tags" });
        for (const tag of result.tags.slice(0, 8)) {
          tags.createSpan({ cls: "memos-plus-tag-chip", text: `#${tag}` });
        }
      }
    }

    if (shown.length < filtered.length) {
      const more = main.createEl("button", { cls: "memos-plus-load-more", text: `${filtered.length - shown.length}` });
      more.addEventListener("click", () => {
        this.visibleCount += this.pageSize();
        void this.renderTimelineOnly();
      });
    }
  }

  private renderTaskIndexResults(main: Element, filterId: OrganizerFilterId): void {
    const lang = this.plugin.settings.language;
    const status = this.plugin.taskIndex.getStatus();
    if (!status.updatedAt && !status.updating) {
      this.plugin.taskIndex.scheduleBuild(0);
    }
    const filtered = filterTaskIndexItems(this.plugin.taskIndex.getItems(), filterId, todayString());
    const shown = filtered.slice(0, this.visibleCount);

    const meta = main.createDiv({ cls: "memos-plus-list-meta" });
    meta.createSpan({ text: `${filtered.length} ${t(lang, "taskIndex.tasks")}` });
    meta.createSpan({ text: t(lang, organizerFilterLabelKey(filterId)) });
    if (status.updating || !status.updatedAt) {
      meta.createSpan({ text: t(lang, "taskIndex.updating") });
    } else {
      meta.createSpan({ text: t(lang, "taskIndex.updatedAt").replace("{time}", formatDateTime(Date.parse(status.updatedAt))) });
    }

    const list = main.createDiv({ cls: "memos-plus-list memos-plus-task-index-results" });
    if (shown.length === 0) {
      list.createDiv({ cls: "memos-plus-empty", text: status.updating ? t(lang, "taskIndex.updating") : t(lang, "empty.noMemos") });
      return;
    }

    for (const item of shown) {
      this.renderTaskIndexCard(list, item, lang);
    }

    if (shown.length < filtered.length) {
      const more = main.createEl("button", { cls: "memos-plus-load-more", text: `${filtered.length - shown.length}` });
      more.addEventListener("click", () => {
        this.visibleCount += this.pageSize();
        void this.renderTimelineOnly();
      });
    }
  }

  private renderTaskIndexCard(list: Element, item: TaskIndexItem, lang: Language): void {
    const card = list.createDiv({ cls: "memos-plus-card memos-plus-task-index-result" });
    card.setAttr("role", "button");
    card.setAttr("tabindex", "0");
    card.setAttr("data-line-number", String(item.lineNumber));
    const open = () => this.openTaskIndexItem(item);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    const header = card.createDiv({ cls: "memos-plus-card-header" });
    header.createDiv({ cls: "memos-plus-card-time", text: formatDateTime(item.mtime) });
    const body = card.createDiv({ cls: "memos-plus-card-body" });
    body.createDiv({ cls: "memos-plus-vault-result-title", text: item.text });
    body.createDiv({ cls: "memos-plus-vault-result-path", text: item.filePath });
    body.createDiv({ cls: "memos-plus-vault-result-excerpt", text: formatTaskIndexSummary(item, lang) });
  }

  private openTaskIndexItem(item: TaskIndexItem): void {
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (file instanceof TFile) {
      void this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  private renderMemoMoreAction(container: Element, label: string, onClick: (event: MouseEvent) => void): void {
    const button = container.createEl("button", {
      cls: "memos-plus-icon-button memos-plus-card-more",
      attr: { type: "button", "aria-label": label, title: label }
    });
    setIcon(button, "more-horizontal");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    });
  }

  private openMemoActionMenu(event: MouseEvent, memo: MemoItem): void {
    const lang = this.plugin.settings.language;
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(t(lang, memo.isPinned ? "memo.unpin" : "memo.pin"))
        .setIcon(memo.isPinned ? "pin-off" : "pin")
        .onClick(() => void this.runMemoAction(() => this.plugin.store.togglePinned(memo)));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, memo.isStarred ? "memo.unstar" : "memo.star"))
        .setIcon(memo.isStarred ? "star-off" : "star")
        .onClick(() => void this.runMemoAction(() => this.plugin.store.toggleStarred(memo)));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, memo.isArchived ? "memo.unarchive" : "memo.archive"))
        .setIcon(memo.isArchived ? "archive-restore" : "archive")
        .onClick(() => void this.runMemoAction(() => this.plugin.store.toggleArchived(memo)));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(t(lang, "common.edit"))
        .setIcon("pencil")
        .onClick(() => this.openMemoEditModal(memo));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "memo.transferToProject"))
        .setIcon("folder-input")
        .onClick(() => void this.transferMemoToProject(memo));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "memo.copy"))
        .setIcon("copy")
        .onClick(() => void this.runMemoAction(() => navigator.clipboard.writeText(memo.content), false));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "memo.openSource"))
        .setIcon("file-text")
        .onClick(() => void this.plugin.store.openMemoSource(memo));
    });
    menu.addItem((item) => {
      item.setTitle(t(lang, "common.delete"))
        .setIcon("trash-2")
        .onClick(() => void this.runMemoAction(() => this.plugin.store.deleteMemo(memo)));
    });
    menu.showAtMouseEvent(event);
  }

  private openMemoEditModal(memo: MemoItem): void {
    new EditMemoModal(this.app, this.plugin.settings.language, memo.content, async (content) => {
      await this.plugin.store.updateMemo(memo, content);
      await this.reload({ preserveScroll: true });
    }).open();
  }

  private async runMemoAction(action: () => Promise<void>, reload = true): Promise<void> {
    await action();
    if (reload) {
      await this.reload({ preserveScroll: true });
    }
  }

  private async transferMemoToProject(memo: MemoItem): Promise<void> {
    const lang = this.plugin.settings.language;
    let delivery: ProjectDeliveryResult | null;
    try {
      delivery = await sendContentToProject(
        {
          app: this.app,
          store: this.plugin.store,
          settings: this.plugin.settings,
          persistSettings: () => this.plugin.persistSettings()
        },
        memo.content,
        {
          initialMode: "project",
          manualCalloutMode: false
        }
      );
    } catch (error) {
      console.error("Memos Plus: failed to transfer memo to project", error);
      new Notice(t(lang, "notice.transferToProjectFailed"));
      return;
    }
    if (!delivery) {
      return;
    }
    this.plugin.settings.organizerMemoStates = {
      ...this.plugin.settings.organizerMemoStates,
      [memo.id]: createOrganizerMemoState("transferred", delivery.file.path)
    };
    await this.plugin.persistSettings();

    let outcome: MemoProjectTransferOutcome;
    try {
      outcome = await applyMemoProjectTransferAfterAction(
        resolveTemplateAfterTransferAction(delivery.template, this.plugin.settings.memoProjectTransferAfterAction),
        memo.isArchived,
        {
          archive: () => this.plugin.store.toggleArchived(memo),
          delete: () => this.plugin.store.deleteMemo(memo),
          confirmDelete: () => window.confirm(t(lang, "memo.transferDeleteConfirm"))
        }
      );
    } catch (error) {
      console.error("Memos Plus: memo delivered, but the original memo could not be processed", error);
      new Notice(t(lang, "notice.transferredPostActionFailed"));
      return;
    }

    const noticeKey =
      outcome === "archived"
        ? "notice.transferredAndArchived"
        : outcome === "deleted"
          ? "notice.transferredAndDeleted"
          : "notice.transferredToProject";
    new Notice(t(lang, noticeKey));
    if (outcome !== "kept") {
      await this.reload({ preserveScroll: true });
    } else {
      await this.render();
    }
  }

  private wireTaskCheckboxes(body: Element, memo: MemoItem): void {
    const checkboxes = Array.from(body.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox"));
    const taskLineIndexes = memo.content
      .split("\n")
      .map((line, index) => (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line) ? index : -1))
      .filter((index) => index >= 0);

    checkboxes.forEach((checkbox, index) => {
      const lineIndex = taskLineIndexes[index];
      if (lineIndex === undefined) {
        return;
      }
      checkbox.addEventListener("change", async () => {
        await this.plugin.store.toggleTask(memo, lineIndex, checkbox.checked);
        await this.reload({ preserveScroll: true });
      });
    });
  }

  private captureMainScrollPosition(): ScrollPositionSnapshot | null {
    const view = this.containerEl.children[1];
    if (!(view instanceof HTMLElement)) {
      return null;
    }
    const main = view.querySelector<HTMLElement>(".memos-plus-main");
    const candidates = [main, view].filter((element): element is HTMLElement => Boolean(element));
    const target = candidates.find((element) => element.scrollTop > 0) ?? candidates.find((element) => element.scrollHeight > element.clientHeight) ?? view;
    return {
      selector: target === main ? ".memos-plus-main" : ".memos-plus-view",
      top: target.scrollTop,
      left: target.scrollLeft
    };
  }

  private restoreMainScrollPosition(snapshot: ScrollPositionSnapshot | null): void {
    if (!snapshot) {
      return;
    }
    requestAnimationFrame(() => {
      const view = this.containerEl.children[1];
      if (!(view instanceof HTMLElement)) {
        return;
      }
      const target = snapshot.selector === ".memos-plus-main" ? view.querySelector<HTMLElement>(".memos-plus-main") : view;
      if (!target) {
        return;
      }
      target.scrollTop = Math.min(snapshot.top, Math.max(0, target.scrollHeight - target.clientHeight));
      target.scrollLeft = snapshot.left;
    });
  }

  private renderMobileFab(shell: Element): void {
    if (!this.plugin.settings.mobileFab || !Platform.isMobile) {
      return;
    }
    const button = shell.createEl("button", { cls: "memos-plus-fab", attr: { "aria-label": t(this.plugin.settings.language, "command.quickCapture") } });
    setIcon(button, "plus");
    button.addEventListener("click", () => {
      new QuickCaptureModal(this.app, {
        settings: this.plugin.settings,
        store: this.plugin.store,
        persistSettings: () => this.plugin.persistSettings(),
        refreshViews: () => this.plugin.refreshViews(),
        resolveMarkdownLink: (text) => this.plugin.resolveMarkdownLink(text)
      }).open();
    });
  }

  private async handleComposerSend(): Promise<void> {
    await this.composerSession?.actions.handleSend();
  }

  private openComposerSendMenu(): void {
    this.composerSession?.actions.openSendMenu();
  }

  private async saveComposer(): Promise<void> {
    await this.composerSession?.actions.saveDefault();
  }

  private async sendComposerToProject(initialMode: "project" | "tag" | "recent" | "search" = "project"): Promise<void> {
    await this.composerSession?.actions.sendToProject(initialMode);
  }

  focusComposer(): void {
    this.composerSession?.focus();
  }
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

function insertSidebarItemAfter(items: SidebarItem[], afterId: string, item: SidebarItem): SidebarItem[] {
  const result: SidebarItem[] = [];
  let inserted = false;
  for (const current of items) {
    if (current.type === "group") {
      const next = { ...current, children: insertSidebarItemAfter(current.children, afterId, item) };
      result.push(next);
      if (current.id === afterId) {
        result.push(item);
        inserted = true;
      }
      if (next.children !== current.children) {
        inserted = true;
      }
      continue;
    }
    result.push(current);
    if (current.id === afterId) {
      result.push(item);
      inserted = true;
    }
  }
  return inserted ? result : [...items, item];
}

function updateSidebarItem(items: SidebarItem[], item: SidebarItem): SidebarItem[] {
  return items.map((current) => {
    if (current.id === item.id) {
      return item;
    }
    if (current.type === "group") {
      return { ...current, children: updateSidebarItem(current.children, item) };
    }
    return current;
  });
}

function removeSidebarItem(items: SidebarItem[], id: string): SidebarItem[] {
  const next: SidebarItem[] = [];
  for (const item of items) {
    if (item.id === id) {
      continue;
    }
    if (item.type === "group") {
      next.push({ ...item, children: removeSidebarItem(item.children, id) });
      continue;
    }
    next.push(item);
  }
  return next;
}

function moveSidebarItemInTree(items: SidebarItem[], id: string, direction: "up" | "down"): SidebarItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) {
      return items;
    }
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return items.map((item) => (item.type === "group" ? { ...item, children: moveSidebarItemInTree(item.children, id, direction) } : item));
}

function moveSidebarItemToTopInTree(items: SidebarItem[], id: string): SidebarItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    return [item, ...next];
  }
  return items.map((item) => (item.type === "group" ? { ...item, children: moveSidebarItemToTopInTree(item.children, id) } : item));
}

function findSidebarParentId(items: SidebarItem[], id: string, parentId = ""): string {
  for (const item of items) {
    if (item.id === id) {
      return parentId;
    }
    if (item.type === "group") {
      const found = findSidebarParentId(item.children, id, item.id);
      if (found || item.children.some((child) => child.id === id)) {
        return found;
      }
    }
  }
  return "";
}

function collectSidebarGroups(items: SidebarItem[], prefix = ""): Array<{ id: string; title: string }> {
  const groups: Array<{ id: string; title: string }> = [];
  for (const item of items) {
    if (item.type !== "group") {
      continue;
    }
    const title = prefix ? `${prefix} / ${item.title}` : item.title;
    groups.push({ id: item.id, title });
    groups.push(...collectSidebarGroups(item.children, title));
  }
  return groups;
}

function collectSidebarSearchIds(items: SidebarItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.type === "search") {
      ids.add(item.searchId);
      continue;
    }
    for (const id of collectSidebarSearchIds(item.children)) {
      ids.add(id);
    }
  }
  return ids;
}

function cloneSidebarGroup(group: SidebarGroupItem, savedSearches: SavedSearch[], copies: SavedSearch[]): SidebarGroupItem {
  const children: SidebarItem[] = [];
  for (const item of group.children) {
    if (item.type === "group") {
      children.push(cloneSidebarGroup(item, savedSearches, copies));
      continue;
    }
    const search = savedSearches.find((candidate) => candidate.id === item.searchId);
    if (!search) {
      continue;
    }
    const searchCopy: SavedSearch = {
      ...search,
      id: createSavedSearchId(),
      name: `${search.name} copy`,
      conditions: search.conditions.map((condition) => ({ ...condition }))
    };
    copies.push(searchCopy);
    children.push(createSidebarSearchItem(createSidebarItemId("item"), `${item.title} copy`, item.icon, searchCopy.id));
  }
  return createSidebarGroup(
    createSidebarItemId("group"),
    `${group.title} copy`,
    group.icon,
    children,
    group.collapsed
  );
}

function recentDays(count: number): string[] {
  const days: string[] = [];
  const current = new Date();
  current.setDate(current.getDate() - count + 1);
  for (let index = 0; index < count; index++) {
    days.push(formatDateLocal(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: number): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const stamp = formatDateLocal(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${stamp} ${hours}:${minutes}`;
}

function formatVaultTaskSummary(task: NonNullable<VaultSearchResult["task"]>, lang: Language): string {
  return [
    t(lang, `savedSearch.taskStatus.${task.completed ? "completed" : "open"}`),
    task.priority !== "none" ? t(lang, `savedSearch.taskPriority.${task.priority}`) : "",
    task.dueDate ? `📅 ${task.dueDate}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatTaskIndexSummary(task: TaskIndexItem, lang: Language): string {
  return [
    task.priority !== "none" ? t(lang, `savedSearch.taskPriority.${task.priority}`) : t(lang, "savedSearch.taskPriority.none"),
    task.dueDate ? `📅 ${task.dueDate}` : "",
    task.scheduledDate ? `⏳ ${task.scheduledDate}` : "",
    task.startDate ? `🛫 ${task.startDate}` : "",
    task.createdDate ? `➕ ${task.createdDate}` : "",
    task.recurring ? "🔁" : "",
    t(lang, "taskIndex.lineNumber").replace("{line}", String(task.lineNumber))
  ]
    .filter(Boolean)
    .join(" · ");
}
