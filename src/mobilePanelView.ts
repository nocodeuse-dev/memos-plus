import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import {
  FILE_TEMPLATE_LIBRARY_TAB_ALL,
  type FileTemplateLibraryItem,
  filterFileTemplateLibraryItemsForTab,
  getFileTemplateLibraryTemplateGroupTab,
  getVisibleFileTemplateLibraryTabIds,
  legacyProjectSendTagsToFileTemplateTabs,
  normalizeFileTemplateTabs,
  type FileTemplateTab
} from "./fileTemplateLibrary";
import {
  type ExistingHeadingBehavior,
  type FileHeadingInfo,
  type FileInsertPosition,
  type FileSendTarget,
  type MarkdownHeadingLevel,
  type NewHeadingPosition,
  type TaggedFileInfo
} from "./fileSend";
import { t } from "./i18n";
import { withMobileClickLock } from "./mobileModalSafety";
import type { ProjectSendChoice, ProjectSendModalOptions } from "./projectFileSuggestModal";
import { createTaskOptionsForm } from "./taskOptionsForm";
import { findManagedTemplateForHeading, resolveTemplateTaskDecision, shouldPromptForHeadingBoundTask, type ManagedTemplate } from "./templateManager";
import type { ProjectTaskOptions, TaskContentMode } from "./tasksFormat";
import type MemosPlusPlugin from "../main";

export const MEMOS_PLUS_MOBILE_PANEL_VIEW_TYPE = "memos-plus-mobile-panel";

const MOBILE_RECENT_FILE_LIMIT = 10;
const MOBILE_RESULT_LIMIT = 30;
const CUSTOM_TAB_PREFIX = "custom:";

type MobilePanelStep = "idle" | "chooseTarget" | "chooseHeading" | "chooseTemplate" | "taskOptions";

export class MemosPlusMobilePanelView extends ItemView {
  private options: ProjectSendModalOptions | null = null;
  private settle: ((choice: ProjectSendChoice | null) => void) | null = null;
  private settled = false;
  private step: MobilePanelStep = "idle";
  private fileQuery = "";
  private activeTabId = "search";
  private fileTemplateTabs: FileTemplateTab[] = [];
  private readonly recentFilesCache = new Map<string, TaggedFileInfo[]>();
  private readonly searchFilesCache = new Map<string, TaggedFileInfo[]>();
  private readonly taggedFilesCache = new Map<string, TaggedFileInfo[]>();
  private readonly headingsCache = new Map<string, FileHeadingInfo[]>();
  private readonly tabSearchQueries = new Map<string, string>();
  private fileTemplatesCache: FileTemplateLibraryItem[] | null = null;
  private tabsScrollLeft = 0;
  private mobileTemplateTabId = FILE_TEMPLATE_LIBRARY_TAB_ALL;
  private mobileTemplateTabsScrollLeft = 0;
  private mobileTemplateQuery = "";
  private renderToken = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: MemosPlusPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return MEMOS_PLUS_MOBILE_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Memos Plus";
  }

  getIcon(): string {
    return "send";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("memos-plus-mobile-panel-view");
    this.contentEl.tabIndex = -1;
    this.renderIdle();
  }

  async prepareForImmediateInteraction(): Promise<void> {
    this.contentEl.tabIndex = -1;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    if (!this.contentEl.isConnected) {
      return;
    }
    this.contentEl.focus({ preventScroll: true });
  }

  async onClose(): Promise<void> {
    this.resolveOnce(null);
    this.contentEl.empty();
    this.clearRuntimeState();
  }

  startProjectSend(options: ProjectSendModalOptions): Promise<ProjectSendChoice | null> {
    this.resolveOnce(null);
    this.clearRuntimeState();
    this.options = options;
    this.fileTemplateTabs = normalizeFileTemplateTabs(options.fileTemplateTabs);
    if (this.fileTemplateTabs.length === 0 && options.customTagTabs) {
      this.fileTemplateTabs = legacyProjectSendTagsToFileTemplateTabs(options.customTagTabs);
    }
    this.activeTabId = this.visibleTabIds()[0] ?? "search";
    this.step = "chooseTarget";
    this.renderTargetPicker();
    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  private clearRuntimeState(): void {
    this.options = null;
    this.settle = null;
    this.settled = false;
    this.step = "idle";
    this.fileQuery = "";
    this.activeTabId = "search";
    this.fileTemplateTabs = [];
    this.recentFilesCache.clear();
    this.searchFilesCache.clear();
    this.taggedFilesCache.clear();
    this.headingsCache.clear();
    this.tabSearchQueries.clear();
    this.fileTemplatesCache = null;
    this.tabsScrollLeft = 0;
    this.mobileTemplateTabId = FILE_TEMPLATE_LIBRARY_TAB_ALL;
    this.mobileTemplateTabsScrollLeft = 0;
    this.mobileTemplateQuery = "";
    this.nextRenderToken();
  }

  private nextRenderToken(): number {
    this.renderToken += 1;
    return this.renderToken;
  }

  private isRenderCurrent(token: number, element?: HTMLElement): boolean {
    return token === this.renderToken && (!element || element.isConnected);
  }

  private resolveOnce(choice: ProjectSendChoice | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    const settle = this.settle;
    this.settle = null;
    settle?.(choice);
  }

  private renderIdle(): void {
    const lang = this.plugin.settings.language;
    this.contentEl.empty();
    this.renderTopBar(t(lang, "mobilePanel.title"));
    this.contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "mobilePanel.idle") });
  }

  private renderTopBar(title: string, backAction?: () => void): HTMLElement {
    const lang = this.plugin.settings.language;
    const header = this.contentEl.createDiv({ cls: `memos-plus-mobile-panel-header${backAction ? " has-back" : ""}` });
    if (backAction) {
      const back = header.createEl("button", {
        cls: "memos-plus-icon-button",
        attr: { type: "button", "aria-label": t(lang, "projectSend.back"), title: t(lang, "projectSend.back") }
      });
      setIcon(back, "arrow-left");
      back.addEventListener("click", backAction);
    }
    header.createEl("h2", { text: title });
    const close = header.createEl("button", {
      cls: "memos-plus-icon-button",
      attr: { type: "button", "aria-label": t(lang, "modal.close"), title: t(lang, "modal.close") }
    });
    setIcon(close, "x");
    close.addEventListener("click", () => {
      this.resolveOnce(null);
      void this.leaf.detach();
    });
    return header;
  }

  private renderTargetPicker(): void {
    const options = this.options;
    if (!options) {
      this.renderIdle();
      return;
    }
    this.captureTabsScrollLeft();
    this.step = "chooseTarget";
    this.contentEl.empty();
    this.renderTopBar(t(options.language, "fileSend.selectFile"));
    this.renderTabs();
    this.contentEl.createDiv({ cls: "memos-plus-mobile-target-search" });
    this.contentEl.createDiv({ cls: "memos-plus-mobile-target-body" });
    this.renderTargetContent();
    this.renderTargetFooter();
  }

  private renderTargetContent(): void {
    const options = this.options;
    if (!options) {
      return;
    }
    const searchArea = this.getTargetSearchEl();
    const body = this.getTargetBodyEl();
    searchArea.empty();
    body.empty();
    if (this.activeTabId === "search") {
      searchArea.removeClass("is-hidden");
      body.createDiv({ cls: "memos-plus-project-list memos-plus-project-search-results memos-plus-mobile-target-list" });
      const list = this.getTargetListEl();
      if (!list) {
        return;
      }
      this.renderTargetSearchInput(searchArea, "search", t(options.language, "fileSend.searchFiles"), this.fileQuery, (value) => {
        this.fileQuery = value;
        void this.renderSearchResults(list);
      });
      void this.renderSearchResults(list);
    } else {
      searchArea.removeClass("is-hidden");
      body.createDiv({ cls: "memos-plus-project-list memos-plus-mobile-target-list" });
      const list = this.getTargetListEl();
      if (!list) {
        return;
      }
      void this.renderTagTabResults(list, this.activeTabId);
    }
  }

  private getTargetSearchEl(): HTMLElement {
    const existing = this.contentEl.querySelector<HTMLElement>(".memos-plus-mobile-target-search");
    return existing ?? this.contentEl.createDiv({ cls: "memos-plus-mobile-target-search" });
  }

  private renderTargetSearchInput(
    container: HTMLElement,
    tabKey: string,
    placeholder: string,
    value: string,
    onSearch: (value: string) => void
  ): HTMLInputElement {
    const search = container.createEl("input", {
      cls: "memos-plus-project-search",
      attr: { type: "search", placeholder }
    });
    search.value = value;
    let debounceTimer: number | null = null;
    search.addEventListener("input", () => {
      const nextValue = search.value;
      if (tabKey !== "search") {
        this.tabSearchQueries.set(tabKey, nextValue);
      }
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        onSearch(nextValue);
      }, 180);
    });
    return search;
  }

  private getTargetBodyEl(): HTMLElement {
    const existing = this.contentEl.querySelector<HTMLElement>(".memos-plus-mobile-target-body");
    return existing ?? this.contentEl.createDiv({ cls: "memos-plus-mobile-target-body" });
  }

  private getTargetListEl(): HTMLElement | null {
    return this.getTargetBodyEl().querySelector(".memos-plus-mobile-target-list");
  }

  private renderTabs(): void {
    const options = this.options;
    if (!options) {
      return;
    }
    const tabs = this.contentEl.createDiv({ cls: "memos-plus-project-send-tabs memos-plus-mobile-panel-tabs" });
    for (const id of this.visibleTabIds()) {
      const button = tabs.createEl("button", {
        cls: `memos-plus-project-send-tab${id === this.activeTabId ? " is-active" : ""}`,
        attr: { type: "button", "aria-pressed": String(id === this.activeTabId) }
      });
      button.dataset.tabId = id;
      button.createSpan({ cls: "memos-plus-project-send-tab-label", text: this.tabLabel(id) });
      button.addEventListener("click", () => {
        this.switchTargetTab(id, tabs);
      });
    }
    tabs.scrollLeft = this.tabsScrollLeft;
    tabs.addEventListener("scroll", () => {
      this.tabsScrollLeft = tabs.scrollLeft;
    });
  }

  private captureTabsScrollLeft(): void {
    const tabs = this.contentEl.querySelector<HTMLElement>(".memos-plus-mobile-panel-tabs");
    if (tabs) {
      this.tabsScrollLeft = tabs.scrollLeft;
    }
  }

  private switchTargetTab(id: string, tabs: HTMLElement): void {
    if (id === this.activeTabId) {
      return;
    }
    this.tabsScrollLeft = tabs.scrollLeft;
    this.activeTabId = id;
    tabs.querySelectorAll<HTMLButtonElement>(".memos-plus-project-send-tab").forEach((button) => {
      const isActive = button.dataset.tabId === id;
      button.toggleClass("is-active", isActive);
      button.setAttr("aria-pressed", String(isActive));
    });
    this.renderTargetContent();
    tabs.scrollLeft = this.tabsScrollLeft;
  }

  private visibleTabIds(): string[] {
    const options = this.options;
    if (!options) {
      return ["search"];
    }
    const hidden = new Set(options.hiddenTabs ?? []);
    const allIds = ["search", ...this.fileTemplateTabs.filter((tab) => tab.type === "tag-filter").map((tab) => customTabId(tab.id))];
    const ordered = normalizeMobileTabOrder(options.tabOrder, allIds).filter((id) => !hidden.has(id));
    return ordered.length > 0 ? ordered : ["search"];
  }

  private tabLabel(id: string): string {
    if (id === "search") {
      return t(this.plugin.settings.language, "fileSend.mode.search");
    }
    return this.fileTemplateTabs.find((tab) => customTabId(tab.id) === id)?.name ?? id;
  }

  private async renderSearchResults(list: HTMLElement): Promise<void> {
    const options = this.options;
    if (!options || this.step !== "chooseTarget") {
      return;
    }
    const token = this.nextRenderToken();
    const query = this.fileQuery.trim();
    list.empty();
    list.createDiv({ cls: "memos-plus-project-empty", text: t(options.language, "common.loading") });
    let files: TaggedFileInfo[] = [];
    try {
      if (!query) {
        const cached = this.recentFilesCache.get("recent");
        files = cached ?? (await options.onLoadRecentFiles());
        this.recentFilesCache.set("recent", files);
      } else {
        const cacheKey = query.toLowerCase();
        const cached = this.searchFilesCache.get(cacheKey);
        files = cached ?? (await options.onSearchFiles(query));
        this.searchFilesCache.set(cacheKey, files);
      }
    } catch (error) {
      console.error("[Memos Plus] Failed to load mobile file targets", error);
    }
    if (!this.isRenderCurrent(token, list) || query !== this.fileQuery.trim()) {
      return;
    }
    list.empty();
    const shown = query ? files.slice(0, MOBILE_RESULT_LIMIT) : files.slice(0, MOBILE_RECENT_FILE_LIMIT);
    if (shown.length === 0) {
      list.createDiv({
        cls: "memos-plus-project-empty",
        text: query ? t(options.language, "fileSend.noFiles") : t(options.language, "fileSend.noRecentFilesSearchHint")
      });
      return;
    }
    this.renderFileOptions(list, shown);
  }

  private async renderTagTabResults(list: HTMLElement, tabId: string): Promise<void> {
    const options = this.options;
    const tab = this.fileTemplateTabs.find((item) => customTabId(item.id) === tabId && item.type === "tag-filter");
    if (!options || !tab || this.step !== "chooseTarget") {
      return;
    }
    const tabKey = customTabId(tab.id);
    const searchArea = this.getTargetSearchEl();
    searchArea.empty();
    this.renderTargetSearchInput(
      searchArea,
      tabKey,
      t(options.language, "fileSend.searchInTab").replace("{tab}", tab.name),
      this.tabSearchQueries.get(tabKey) ?? "",
      () => {
        const cachedFiles = this.getCachedTagTabFiles(tab);
        if (cachedFiles) {
          this.renderMobileTagFileList(list, cachedFiles, tabKey);
        }
      }
    );
    const token = this.nextRenderToken();
    list.empty();
    list.createDiv({ cls: "memos-plus-project-empty", text: t(options.language, "common.loading") });
    let files: TaggedFileInfo[] = [];
    try {
      files = await this.loadMobileTagTabFiles(tab);
    } catch (error) {
      console.error("[Memos Plus] Failed to load mobile tag file targets", error);
    }
    if (!this.isRenderCurrent(token, list)) {
      return;
    }
    this.renderMobileTagFileList(list, files, tabKey);
  }

  private async loadMobileTagTabFiles(tab: FileTemplateTab): Promise<TaggedFileInfo[]> {
    const options = this.options;
    const byPath = new Map<string, TaggedFileInfo>();
    if (!options) {
      return [];
    }
    for (const tag of tab.tags) {
      const key = tag.trim().toLowerCase();
      const cached = this.taggedFilesCache.get(key);
      const files = cached ?? (await options.onLoadTaggedFiles(tag));
      this.taggedFilesCache.set(key, files);
      for (const file of files) {
        byPath.set(file.path, file);
      }
    }
    return [...byPath.values()].sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  }

  private getCachedTagTabFiles(tab: FileTemplateTab): TaggedFileInfo[] | null {
    const byPath = new Map<string, TaggedFileInfo>();
    for (const tag of tab.tags) {
      const cached = this.taggedFilesCache.get(tag.trim().toLowerCase());
      if (!cached) {
        return null;
      }
      for (const file of cached) {
        byPath.set(file.path, file);
      }
    }
    return [...byPath.values()].sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  }

  private renderMobileTagFileList(list: HTMLElement, files: TaggedFileInfo[], tabKey: string): void {
    const options = this.options;
    if (!options) {
      return;
    }
    const query = this.tabSearchQueries.get(tabKey) ?? "";
    const shown = filterTaggedFilesByQuery(files, query).slice(0, MOBILE_RESULT_LIMIT);
    list.empty();
    if (shown.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: query.trim() ? t(options.language, "fileSend.noFilesInTab") : t(options.language, "fileSend.noFiles") });
      return;
    }
    this.renderFileOptions(list, shown);
  }

  private renderFileOptions(list: HTMLElement, files: TaggedFileInfo[]): void {
    for (const info of files) {
      const button = list.createEl("button", { cls: "memos-plus-project-option", attr: { type: "button" } });
      button.setAttr("title", `${info.name}\n${info.path}`);
      const title = button.createDiv({ cls: "memos-plus-project-option-title" });
      setIcon(title.createSpan({ cls: "memos-plus-file-target-icon" }), "file-text");
      title.createSpan({ cls: "memos-plus-project-option-title-text", text: info.name });
      const meta = [info.status ?? "", compactFilePath(info.path), formatUpdatedAt(info.updatedAt)].filter(Boolean);
      if (meta.length > 0) {
        title.createSpan({ cls: "memos-plus-project-option-meta-inline", text: meta.join(" · ") });
      }
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.renderHeadingPicker(info)));
    }
  }

  private renderTargetFooter(): void {
    const options = this.options;
    if (!options?.onSaveDefault && !options?.enableFileTargets) {
      return;
    }
    const footer = this.contentEl.createDiv({ cls: "memos-plus-project-footer memos-plus-mobile-panel-footer" });
    if (options.onSaveDefault) {
      const direct = footer.createEl("button", { cls: "memos-plus-project-add", attr: { type: "button" } });
      setIcon(direct, "send");
      direct.createSpan({ text: t(options.language, "projectSend.directSend") });
      direct.addEventListener("click", () => void withMobileClickLock(direct, () => this.saveDefault(direct)));
    }
    if (options.enableFileTargets) {
      const createFile = footer.createEl("button", { cls: "memos-plus-project-add", attr: { type: "button" } });
      setIcon(createFile, "file-plus");
      createFile.createSpan({ text: t(options.language, "projectSend.createFileFromSearch") });
      createFile.addEventListener("click", () => void withMobileClickLock(createFile, () => this.openQuickCreateForActiveTab()));
    }
  }

  private async openQuickCreateForActiveTab(): Promise<void> {
    const options = this.options;
    if (!options) {
      return;
    }
    if (this.activeTabId === "search") {
      await this.renderTemplatePicker(this.fileQuery.trim(), options.defaultFileTag);
      return;
    }
    const preferredPath = this.preferredTemplatePathForActiveTab();
    if (!preferredPath) {
      this.noticeMissingTabTemplate();
      return;
    }
    let templates: FileTemplateLibraryItem[] = [];
    try {
      templates = this.fileTemplatesCache ?? (await options.onLoadFileTemplates());
      this.fileTemplatesCache = templates;
    } catch (error) {
      console.error("[Memos Plus] Failed to validate mobile tab quick-create template", error);
    }
    if (!templates.some((item) => item.path === preferredPath)) {
      this.noticeMissingTabTemplate();
      return;
    }
    const tab = this.fileTemplateTabs.find((item) => customTabId(item.id) === this.activeTabId);
    const tag = tab?.type === "tag-filter" ? tab.tags[0] ?? "" : "";
    await this.renderTemplatePicker(this.tabSearchQueries.get(this.activeTabId)?.trim() ?? "", tag, preferredPath);
  }

  private preferredTemplatePathForActiveTab(): string {
    return this.options?.tabTemplateBindings?.[this.activeTabId] ?? "";
  }

  private noticeMissingTabTemplate(): void {
    const options = this.options;
    if (!options) {
      return;
    }
    new Notice(t(options.language, "projectSend.tabTemplateMissing"));
    options.onOpenTabTemplateBindings?.(this.activeTabId);
  }

  private async saveDefault(button: HTMLButtonElement): Promise<void> {
    const options = this.options;
    if (!options?.onSaveDefault) {
      return;
    }
    button.disabled = true;
    try {
      await options.onSaveDefault();
      this.resolveOnce(null);
      void this.leaf.detach();
    } catch (error) {
      console.error("Memos Plus: failed to save memo to default destination from mobile panel", error);
      new Notice(t(options.language, "notice.sendFailedDraftSaved"));
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }

  private async renderHeadingPicker(info: TaggedFileInfo): Promise<void> {
    const options = this.options;
    if (!options) {
      return;
    }
    this.step = "chooseHeading";
    this.contentEl.empty();
    this.renderTopBar(info.name, () => this.renderTargetPicker());
    this.contentEl.createDiv({ cls: "memos-plus-project-section-hint", text: info.path });
    const position = createSelectField(this.contentEl, t(options.language, "fileSend.selectPosition"), [
      ["heading-top", t(options.language, "fileSend.position.headingTop")],
      ["heading-bottom", t(options.language, "fileSend.position.headingBottom")],
      ["new-heading", t(options.language, "fileSend.position.newHeading")],
      ["file-end", t(options.language, "fileSend.position.fileEnd")],
      ["file-start", t(options.language, "fileSend.position.fileStart")]
    ]);
    position.value = options.defaultFileInsertPosition;
    const newHeadingControls = this.contentEl.createDiv({ cls: "memos-plus-new-heading-options" });
    const newHeadingName = createTextField(newHeadingControls, t(options.language, "fileSend.newHeadingName"), this.defaultInsertHeading());
    const newHeadingLevel = createSelectField(
      newHeadingControls,
      t(options.language, "fileSend.newHeadingLevel"),
      [1, 2, 3, 4, 5, 6].map((level) => [String(level), t(options.language, `fileSend.headingLevel.${level}`)])
    );
    newHeadingLevel.value = "2";
    const newHeadingPosition = createSelectField(newHeadingControls, t(options.language, "fileSend.newHeadingPosition"), [
      ["file-end", t(options.language, "fileSend.newHeadingPosition.file-end")],
      ["file-start", t(options.language, "fileSend.newHeadingPosition.file-start")],
      ["after-current-heading", t(options.language, "fileSend.newHeadingPosition.after-current-heading")]
    ]);
    const existingHeadingBehavior = createSelectField(newHeadingControls, t(options.language, "fileSend.existingHeadingBehavior"), [
      ["use-existing", t(options.language, "fileSend.existingHeadingBehavior.use-existing")],
      ["create-duplicate", t(options.language, "fileSend.existingHeadingBehavior.create-duplicate")],
      ["cancel", t(options.language, "fileSend.existingHeadingBehavior.cancel")]
    ]);
    const buildNewHeadingTarget = (currentHeading: string): Partial<FileSendTarget> => ({
      newHeadingName: newHeadingName.value.trim() || this.defaultInsertHeading(),
      newHeadingLevel: normalizeHeadingLevelValue(newHeadingLevel.value),
      newHeadingPosition: normalizeNewHeadingPositionValue(newHeadingPosition.value),
      existingHeadingBehavior: normalizeExistingHeadingBehaviorValue(existingHeadingBehavior.value),
      heading: currentHeading
    });
    const createHeading = newHeadingControls.createEl("button", {
      cls: "memos-plus-save-button",
      attr: { type: "button" },
      text: t(options.language, "fileSend.position.newHeading")
    });
    createHeading.addEventListener("click", () =>
      void withMobileClickLock(createHeading, () =>
        this.handleFileTargetChoice(info.file, "", "new-heading", info, false, buildNewHeadingTarget(""))
      )
    );
    const updateNewHeadingVisibility = (): void => {
      newHeadingControls.toggleClass("is-hidden", position.value !== "new-heading");
    };
    position.addEventListener("change", updateNewHeadingVisibility);
    updateNewHeadingVisibility();

    const list = this.contentEl.createDiv({ cls: "memos-plus-project-section-grid memos-plus-heading-target-grid" });
    list.createDiv({ cls: "memos-plus-project-empty", text: t(options.language, "common.loading") });
    let headings: FileHeadingInfo[] = [];
    try {
      const cached = this.headingsCache.get(info.path);
      headings = cached ?? (await options.onLoadHeadings(info.file));
      this.headingsCache.set(info.path, headings);
    } catch (error) {
      console.error("[Memos Plus] Failed to load mobile file headings", error);
    }
    if (this.step !== "chooseHeading" || !list.isConnected) {
      return;
    }
    list.empty();
    if (headings.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(options.language, "fileSend.noHeadings") });
      if (options.noHeadingBehavior === "file-start" || options.noHeadingBehavior === "file-end") {
        this.handleFileTargetChoice(info.file, "", options.noHeadingBehavior, info);
        return;
      }
      this.renderFilePositionButtons(list, info.file, info, true);
      return;
    }

    const defaultHeading = this.defaultInsertHeading();
    for (const heading of headings) {
      const button = list.createEl("button", {
        cls: `memos-plus-project-section${heading.heading === defaultHeading ? " is-default" : ""}`,
        attr: { type: "button" }
      });
      button.setText(`${"  ".repeat(Math.max(0, heading.level - 1))}${"#".repeat(heading.level)} ${heading.heading}`);
      button.addEventListener("click", () =>
        void withMobileClickLock(button, () => {
          const selectedPosition = position.value as FileInsertPosition;
          this.handleFileTargetChoice(
            info.file,
            heading.heading,
            selectedPosition,
            info,
            false,
            selectedPosition === "new-heading" ? buildNewHeadingTarget(heading.heading) : {}
          );
        })
      );
    }
    this.renderFilePositionButtons(list, info.file, info);
  }

  private async renderTemplatePicker(initialTitle = "", initialTag = "", preferredPath = ""): Promise<void> {
    const options = this.options;
    if (!options) {
      return;
    }
    this.step = "chooseTemplate";
    this.contentEl.empty();
    this.renderTopBar(t(options.language, "fileTemplateLibrary.useTemplateCreate"), () => this.renderTargetPicker());
    const content = this.contentEl.createDiv({ cls: "memos-plus-mobile-panel-content" });
    const titleInput = createTextField(content, t(options.language, "fileTemplateLibrary.fileName"), initialTitle || "未命名");
    titleInput.value = initialTitle;
    const tagInput = createTextField(content, t(options.language, "settings.sendToFileDefaultTag"), initialTag);
    tagInput.value = initialTag;
    const tabs = this.renderMobileTemplateTabs(content);
    const search = this.renderMobileTemplateSearchInput(content);
    const list = content.createDiv({ cls: "memos-plus-file-template-list memos-plus-mobile-template-list" });
    list.createDiv({ cls: "memos-plus-project-empty", text: t(options.language, "common.loading") });
    const token = this.nextRenderToken();
    let templates: FileTemplateLibraryItem[] = [];
    try {
      templates = this.fileTemplatesCache ?? (await options.onLoadFileTemplates());
      this.fileTemplatesCache = templates;
    } catch (error) {
      console.error("[Memos Plus] Failed to load mobile file templates", error);
    }
    if (!this.isRenderCurrent(token, list) || this.step !== "chooseTemplate") {
      return;
    }
    this.renderMobileTemplateList(list, templates, titleInput, tagInput, preferredPath);
    search.addEventListener("input", () => {
      this.mobileTemplateQuery = search.value;
      this.renderMobileTemplateList(list, templates, titleInput, tagInput, preferredPath);
    });
    tabs.querySelectorAll<HTMLButtonElement>(".memos-plus-mobile-template-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.dataset.tabId ?? FILE_TEMPLATE_LIBRARY_TAB_ALL;
        this.mobileTemplateTabsScrollLeft = tabs.scrollLeft;
        this.mobileTemplateTabId = tabId;
        tabs.querySelectorAll<HTMLButtonElement>(".memos-plus-mobile-template-tab").forEach((tabButton) => {
          const isActive = tabButton.dataset.tabId === tabId;
          tabButton.toggleClass("is-active", isActive);
          tabButton.setAttr("aria-pressed", String(isActive));
        });
        search.setAttr("placeholder", this.mobileTemplateSearchPlaceholder());
        this.renderMobileTemplateList(list, templates, titleInput, tagInput, preferredPath);
        tabs.scrollLeft = this.mobileTemplateTabsScrollLeft;
      });
    });
  }

  private renderMobileTemplateTabs(container: HTMLElement): HTMLElement {
    const options = this.options;
    const tabs = container.createDiv({ cls: "memos-plus-file-template-tabs memos-plus-mobile-template-tabs" });
    if (!options) {
      return tabs;
    }
    const tabIds = getVisibleFileTemplateLibraryTabIds(this.fileTemplateTabs, options.fileTemplateLibraryTabOrder);
    if (!tabIds.includes(this.mobileTemplateTabId)) {
      this.mobileTemplateTabId = FILE_TEMPLATE_LIBRARY_TAB_ALL;
    }
    for (const id of tabIds) {
      const label =
        id === FILE_TEMPLATE_LIBRARY_TAB_ALL
          ? t(options.language, "fileTemplateLibrary.category.all")
          : getFileTemplateLibraryTemplateGroupTab(id, this.fileTemplateTabs)?.name ?? id;
      const isActive = id === this.mobileTemplateTabId;
      tabs.createEl("button", {
        cls: `memos-plus-file-template-tab memos-plus-mobile-template-tab${isActive ? " is-active" : ""}`,
        attr: { type: "button", "aria-pressed": String(isActive), "data-tab-id": id },
        text: label
      });
    }
    tabs.scrollLeft = this.mobileTemplateTabsScrollLeft;
    tabs.addEventListener("scroll", () => {
      this.mobileTemplateTabsScrollLeft = tabs.scrollLeft;
    });
    return tabs;
  }

  private renderMobileTemplateSearchInput(container: HTMLElement): HTMLInputElement {
    const search = container.createEl("input", {
      cls: "memos-plus-project-search memos-plus-mobile-template-search",
      attr: { type: "search", placeholder: this.mobileTemplateSearchPlaceholder() }
    });
    search.value = this.mobileTemplateQuery;
    return search;
  }

  private mobileTemplateSearchPlaceholder(): string {
    const options = this.options;
    if (!options || this.mobileTemplateTabId === FILE_TEMPLATE_LIBRARY_TAB_ALL) {
      return t(options?.language, "fileSend.searchFiles");
    }
    const label = getFileTemplateLibraryTemplateGroupTab(this.mobileTemplateTabId, this.fileTemplateTabs)?.name ?? this.mobileTemplateTabId;
    return t(options.language, "fileSend.searchInTab").replace("{tab}", label);
  }

  private renderMobileTemplateList(
    list: HTMLElement,
    templates: FileTemplateLibraryItem[],
    titleInput: HTMLInputElement,
    tagInput: HTMLInputElement,
    preferredPath = ""
  ): void {
    const options = this.options;
    if (!options) {
      return;
    }
    list.empty();
    const items = prioritizeTemplatePath(filterTemplateItemsByQuery(this.mobileTemplateItems(templates), this.mobileTemplateQuery), preferredPath).slice(
      0,
      MOBILE_RESULT_LIMIT
    );
    if (items.length === 0) {
      list.createDiv({
        cls: "memos-plus-project-empty",
        text:
          this.mobileTemplateQuery.trim() || this.mobileTemplateTabId === FILE_TEMPLATE_LIBRARY_TAB_ALL
            ? t(options.language, "fileTemplateLibrary.empty")
            : t(options.language, "fileTemplateLibrary.emptyGroup")
      });
      return;
    }
    for (const item of items) {
      const row = list.createEl("button", {
        cls: `memos-plus-file-template-item${preferredPath && item.path === preferredPath ? " is-selected" : ""}`,
        attr: { type: "button" }
      });
      const info = row.createDiv({ cls: "memos-plus-file-template-item-info" });
      const title = info.createDiv({ cls: "memos-plus-file-template-item-title" });
      setIcon(title.createSpan({ cls: "memos-plus-file-template-icon" }), "file-plus");
      title.createSpan({ cls: "memos-plus-file-template-item-name", text: item.name });
      info.createDiv({ cls: "memos-plus-file-template-item-meta", text: [item.category, compactFilePath(item.path)].filter(Boolean).join(" · ") });
      row.addEventListener("click", () =>
        void withMobileClickLock(row, () => this.createFileFromTemplate(row, item, titleInput.value.trim(), tagInput.value.trim()))
      );
    }
  }

  private mobileTemplateItems(templates: FileTemplateLibraryItem[]): FileTemplateLibraryItem[] {
    if (this.mobileTemplateTabId === FILE_TEMPLATE_LIBRARY_TAB_ALL) {
      return templates;
    }
    const tab = getFileTemplateLibraryTemplateGroupTab(this.mobileTemplateTabId, this.fileTemplateTabs);
    return tab ? filterFileTemplateLibraryItemsForTab(templates, tab) : [];
  }

  private async createFileFromTemplate(button: HTMLButtonElement, item: FileTemplateLibraryItem, title: string, tag: string): Promise<void> {
    const options = this.options;
    if (!options) {
      return;
    }
    button.disabled = true;
    try {
      const file = await options.onCreateFromFileTemplate(item.path, title || "未命名", tag);
      if (!file) {
        throw new Error("File template creation returned no file");
      }
      try {
        await options.onMarkFileTemplateRecent(item.path);
      } catch (error) {
        console.error("[Memos Plus] Failed to mark mobile file template as recent", error);
      }
      await this.renderHeadingPicker(createdFileToTaggedFileInfo(file, tag));
    } catch (error) {
      console.error("[Memos Plus] Failed to create mobile file from template", error);
      new Notice(t(options.language, "fileTemplateLibrary.createFailed"));
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }

  private renderFilePositionButtons(container: HTMLElement, file: TFile, info: TaggedFileInfo, includeCreateHeading = false): void {
    const options = this.options;
    if (!options) {
      return;
    }
    for (const [position, label] of [
      ["file-end", t(options.language, "fileSend.position.fileEnd")],
      ["file-start", t(options.language, "fileSend.position.fileStart")]
    ] as Array<[FileInsertPosition, string]>) {
      const button = container.createEl("button", { cls: "memos-plus-project-section", attr: { type: "button" }, text: label });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.handleFileTargetChoice(file, "", position, info)));
    }
    if (includeCreateHeading) {
      const heading = this.defaultInsertHeading();
      const button = container.createEl("button", {
        cls: "memos-plus-project-section is-default",
        attr: { type: "button" },
        text: `${t(options.language, "fileSend.position.createHeading")}：${heading}`
      });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.handleFileTargetChoice(file, heading, "heading-top", info, true)));
    }
  }

  private handleFileTargetChoice(
    file: TFile,
    heading: string,
    position: FileInsertPosition,
    info: TaggedFileInfo,
    createHeadingIfMissing = false,
    targetOptions: Partial<FileSendTarget> = {}
  ): void {
    const options = this.options;
    if (!options) {
      return;
    }
    const taskHeading = position === "new-heading" ? targetOptions.newHeadingName ?? heading : heading;
    const headingBoundTemplate = this.headingBoundTemplateForHeading(taskHeading);
    const template = this.templateForHeading(taskHeading);
    const decision = resolveTemplateTaskDecision(template, {
      content: options.content,
      heading: taskHeading
    });
    const promptForHeadingBoundTask = shouldPromptForHeadingBoundTask(template, headingBoundTemplate, options.taskSettings.promptOnCreate);
    if (decision === "ask" || (decision === "task" && promptForHeadingBoundTask)) {
      this.renderTaskOptions(
        `${file.basename} · ${taskHeading || t(options.language, position === "file-start" ? "fileSend.position.fileStart" : "fileSend.position.fileEnd")}`,
        () => void this.renderHeadingPicker(info).catch((error) => {
          console.warn("[Memos Plus] Failed to render mobile heading picker", error);
        }),
        (task) => this.chooseFile(file, heading, position, task, createHeadingIfMissing, targetOptions, template),
        this.defaultTaskContentMode(template)
      );
      return;
    }
    this.chooseFile(file, heading, position, decision === "task" ? this.defaultTaskOptions(template) : undefined, createHeadingIfMissing, targetOptions, template);
  }

  private renderTaskOptions(
    title: string,
    backAction: () => void,
    onConfirm: (task?: ProjectTaskOptions) => void,
    taskContentMode: TaskContentMode
  ): void {
    const options = this.options;
    if (!options) {
      return;
    }
    this.step = "taskOptions";
    this.contentEl.empty();
    this.renderTopBar(t(options.language, "projectSend.taskOptions"), backAction);
    this.contentEl.createDiv({ cls: "memos-plus-project-section-hint", text: title });
    const taskOptionsForm = createTaskOptionsForm(this.contentEl, {
      language: options.language,
      taskSettings: options.taskSettings,
      defaultAsTask: true,
      taskContentMode,
      renderMetadataOptions: options.taskSettings.enabled
    });
    const footer = this.contentEl.createDiv({ cls: "memos-plus-project-footer memos-plus-mobile-panel-footer" });
    const confirm = footer.createEl("button", { cls: "memos-plus-save-button", attr: { type: "button" }, text: t(options.language, "projectSend.confirm") });
    confirm.addEventListener("click", () => void withMobileClickLock(confirm, () => onConfirm(taskOptionsForm.value())));
  }

  private chooseFile(
    file: TFile,
    heading: string,
    position: FileInsertPosition,
    task?: ProjectTaskOptions,
    createHeadingIfMissing = false,
    targetOptions: Partial<FileSendTarget> = {},
    template = this.currentTemplate()
  ): void {
    this.resolveOnce({
      file,
      section: heading,
      task,
      mode: "file",
      fileTarget: { heading, position, createHeadingIfMissing, ...targetOptions },
      template
    });
    void this.leaf.detach();
  }

  private currentTemplate(): ManagedTemplate | undefined {
    const options = this.options;
    return options?.templates.find((template) => template.id === options.initialTemplateId) ?? options?.templates[0];
  }

  private templateForHeading(heading: string): ManagedTemplate | undefined {
    const options = this.options;
    return options ? this.headingBoundTemplateForHeading(heading) ?? this.currentTemplate() : undefined;
  }

  private headingBoundTemplateForHeading(heading: string): ManagedTemplate | undefined {
    return this.options ? findManagedTemplateForHeading(this.options.templates, heading) : undefined;
  }

  private defaultInsertHeading(): string {
    return this.options?.defaultHeading.trim() || "收集箱";
  }

  private defaultTaskOptions(template = this.currentTemplate()): ProjectTaskOptions {
    const taskSettings = this.options?.taskSettings;
    return {
      isTask: true,
      priority: taskSettings?.defaultPriority ?? "medium",
      scheduledDate: taskSettings?.defaultScheduledDate ?? "",
      dueDate: taskSettings?.defaultDueDate ?? "",
      recurrence: taskSettings?.defaultRecurrence ?? "none",
      addCreatedDate: taskSettings?.addCreatedDate ?? true,
      contentMode: this.defaultTaskContentMode(template)
    };
  }

  private defaultTaskContentMode(template = this.currentTemplate()): TaskContentMode {
    const mode = template?.taskContentMode ?? "task-with-detail";
    return mode === "ask" ? "task-with-detail" : mode;
  }
}

function normalizeMobileTabOrder(order: string[], available: string[]): string[] {
  const availableSet = new Set(available);
  const normalized = order.filter((id) => availableSet.has(id));
  for (const id of available) {
    if (!normalized.includes(id)) {
      normalized.push(id);
    }
  }
  return normalized;
}

function customTabId(id: string): string {
  return `${CUSTOM_TAB_PREFIX}${id}`;
}

function compactFilePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) {
    return path;
  }
  return `${parts[0]}/…/${parts[parts.length - 1]}`;
}

function filterTaggedFilesByQuery(files: TaggedFileInfo[], query: string): TaggedFileInfo[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return files;
  }
  return files.filter((file) => file.name.toLowerCase().includes(normalized) || file.path.toLowerCase().includes(normalized));
}

function filterTemplateItemsByQuery(items: FileTemplateLibraryItem[], query: string): FileTemplateLibraryItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(normalized) || item.path.toLowerCase().includes(normalized));
}

function prioritizeTemplatePath(items: FileTemplateLibraryItem[], preferredPath: string): FileTemplateLibraryItem[] {
  if (!preferredPath) {
    return items;
  }
  const preferred = items.find((item) => item.path === preferredPath);
  if (!preferred) {
    return items;
  }
  return [preferred, ...items.filter((item) => item.path !== preferredPath)];
}

function formatUpdatedAt(timestamp: number): string {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp).toLocaleDateString();
}

function createdFileToTaggedFileInfo(file: TFile, tag = ""): TaggedFileInfo {
  const normalizedTag = tag.trim().replace(/^#+/, "");
  return {
    file,
    name: file.basename,
    path: file.path,
    tags: normalizedTag ? [normalizedTag] : [],
    matchTags: normalizedTag ? [normalizedTag] : [],
    updatedAt: file.stat?.mtime ?? Date.now()
  };
}

function createSelectField(container: HTMLElement, labelText: string, options: Array<[string, string]>): HTMLSelectElement {
  const label = container.createEl("label", { cls: "memos-plus-project-field" });
  label.createSpan({ text: labelText });
  const select = label.createEl("select");
  for (const [value, text] of options) {
    select.createEl("option", { value, text });
  }
  return select;
}

function createTextField(container: HTMLElement, labelText: string, placeholder = ""): HTMLInputElement {
  const label = container.createEl("label", { cls: "memos-plus-project-field" });
  label.createSpan({ text: labelText });
  return label.createEl("input", { attr: { type: "text", placeholder } });
}

function normalizeHeadingLevelValue(value: string): MarkdownHeadingLevel {
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 && parsed <= 6 ? (parsed as MarkdownHeadingLevel) : 2;
}

function normalizeNewHeadingPositionValue(value: string): NewHeadingPosition {
  return value === "file-start" || value === "after-current-heading" ? value : "file-end";
}

function normalizeExistingHeadingBehaviorValue(value: string): ExistingHeadingBehavior {
  return value === "create-duplicate" || value === "cancel" ? value : "use-existing";
}
