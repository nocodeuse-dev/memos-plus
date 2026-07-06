import { App, Menu, Modal, Notice, Platform, TFile, setIcon } from "obsidian";
import {
  normalizeFileTag,
  type ExistingHeadingBehavior,
  type FileHeadingInfo,
  type FileInsertPosition,
  type FileSendTarget,
  type MarkdownHeadingLevel,
  type NewHeadingPosition,
  type NoHeadingBehavior,
  type TaggedFileInfo
} from "./fileSend";
import {
  createTagFilterFileTemplateTab,
  createTemplateGroupFileTemplateTab,
  FILE_TEMPLATE_LIBRARY_TAB_ALL,
  filterFileTemplateLibraryItems,
  filterFileTemplateLibraryItemsForTab,
  getFileTemplateLibraryTemplateGroupTab,
  getFileTemplateLibraryTemplateGroupTabId,
  getVisibleFileTemplateLibraryTabIds,
  legacyProjectSendTagsToFileTemplateTabs,
  normalizeFileTemplateTabs,
  normalizeVisibleFileTemplateLibraryDefaultTabId,
  type FileTemplateLibraryItem,
  type FileTemplateTabInteractionSettings,
  type FileTemplateTab,
  type FileTemplateTabType
} from "./fileTemplateLibrary";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { confirmWithModal } from "./confirmModal";
import { logMemosPlusDiagnostic } from "./diagnostics";
import { focusOnDesktopOnly } from "./modalFocus";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";
import { debounce, modalDebounceDelay, modalResultLimit } from "./performance";
import { createTaskOptionsForm } from "./taskOptionsForm";
import {
  findManagedTemplateForHeading,
  resolveTemplateTaskDecision,
  shouldPromptForHeadingBoundTask,
  type ManagedTemplate,
  type TemplateTaskDecision
} from "./templateManager";
import type { ProjectTaskOptions, TaskContentMode, TaskPriority, TaskRecurrence } from "./tasksFormat";

export type ProjectSendInitialMode = "project" | "tag" | "recent" | "search";
type SendMode = "search" | "custom-tag";

const FIXED_SEND_TABS: SendMode[] = ["search"];
const CUSTOM_TAB_PREFIX = "custom:";
const MOBILE_EMPTY_SEARCH_RECENT_FILE_LIMIT = 10;

export interface ModalPerformanceSettings {
  mobilePerformanceMode: boolean;
  performanceSafeMode: boolean;
}

export interface ProjectSendChoice {
  file: TFile;
  section: string;
  task?: ProjectTaskOptions;
  mode?: "file";
  fileTarget?: FileSendTarget;
  template?: ManagedTemplate;
}

export interface ProjectSendTaskSettings {
  enabled: boolean;
  defaultSection: string;
  addCreatedDate: boolean;
  defaultPriority: TaskPriority;
  defaultDueDate: string;
  defaultScheduledDate: string;
  defaultRecurrence: TaskRecurrence;
  promptOnCreate: boolean;
}

export interface ProjectSendModalOptions {
  language: Language;
  content: string;
  defaultHeading: string;
  initialMode?: ProjectSendInitialMode;
  taskSettings: ProjectSendTaskSettings;
  enableFileTargets: boolean;
  customTagTabs?: string[];
  fileTemplateTabs: FileTemplateTab[];
  fileTemplateTabInteraction: FileTemplateTabInteractionSettings;
  performanceSettings: ModalPerformanceSettings;
  fileTemplateLibraryDefaultTabId: string;
  fileTemplateLibraryTabOrder: string[];
  tabTemplateBindings?: Record<string, string>;
  tabOrder: string[];
  hiddenTabs: string[];
  templates: ManagedTemplate[];
  initialTemplateId?: string;
  preferredFileTemplatePath?: string;
  defaultFileTag: string;
  defaultFileInsertPosition: FileInsertPosition;
  noHeadingBehavior: NoHeadingBehavior;
  onLoadFileTemplates: () => Promise<FileTemplateLibraryItem[]>;
  onCreateFromFileTemplate: (templatePath: string, title: string, tag?: string) => Promise<TFile | null>;
  onDeleteFileTemplate: (templatePath: string) => Promise<void>;
  onMarkFileTemplateRecent: (templatePath: string) => Promise<void>;
  getPreferredFileTemplatePath?: (tag: string) => string;
  onOpenTabTemplateBindings?: (tabId: string) => void;
  onLoadTaggedFiles: (tagQuery: string) => Promise<TaggedFileInfo[]>;
  onLoadRecentFiles: () => Promise<TaggedFileInfo[]>;
  onSearchFiles: (query: string) => Promise<TaggedFileInfo[]>;
  onLoadHeadings: (file: TFile) => Promise<FileHeadingInfo[]>;
  onSaveCustomTagTabs?: (tags: string[]) => Promise<void>;
  onSaveFileTemplateTabs: (tabs: FileTemplateTab[]) => Promise<void>;
  onSaveFileTemplateLibraryPreferences?: (state: { defaultTabId?: string; tabOrder?: string[] }) => Promise<void>;
  onSaveTabPreferences: (state: { tabOrder: string[]; hiddenTabs: string[] }) => Promise<void>;
  onSaveDefault?: () => Promise<void>;
  onChoose: (choice: ProjectSendChoice | null) => void;
}

class ProjectTemplateTabModal extends Modal {
  private input!: HTMLInputElement;
  private typeSelect!: HTMLSelectElement;

  constructor(
    app: App,
    private readonly language: Language,
    private readonly onSubmit: (value: string, type: FileTemplateTabType) => Promise<void>,
    private readonly initialValue = "",
    private readonly titleKey = "projectSend.addTagTab",
    private readonly submitKey = "projectSend.addTagTab"
  ) {
    super(app);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "ProjectTemplateTabModal");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal");
    contentEl.createEl("h2", { text: t(this.language, this.titleKey) });
    this.typeSelect = createSelectField(contentEl, t(this.language, "projectSend.addTemplateTabType"), [
      ["tag-filter", t(this.language, "settings.fileTemplateTabType.tag-filter")],
      ["template-group", t(this.language, "settings.fileTemplateTabType.template-group")]
    ]);
    this.input = contentEl.createEl("input", {
      cls: "memos-plus-project-name-input",
      attr: {
        type: "text",
        placeholder: t(this.language, "projectSend.addTagTabPrompt")
      }
    });
    this.input.value = this.initialValue;

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    const cancel = footer.createEl("button", { attr: { type: "button" }, text: t(this.language, "modal.cancel") });
    const save = footer.createEl("button", {
      cls: "memos-plus-save-button",
      attr: { type: "button" },
      text: t(this.language, this.submitKey)
    });
    cancel.addEventListener("click", () => this.close());
    save.addEventListener("click", () => void withMobileClickLock(save, () => this.submit(save)));
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void withMobileClickLock(save, () => this.submit(save));
      }
    });
    focusOnDesktopOnly(this.input);
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "ProjectTemplateTabModal");
    this.contentEl.empty();
  }

  private async submit(button: HTMLButtonElement): Promise<void> {
    const value = this.input.value.trim();
    if (!value) {
      focusOnDesktopOnly(this.input);
      return;
    }
    button.disabled = true;
    try {
      await this.onSubmit(value, this.typeSelect.value === "template-group" ? "template-group" : "tag-filter");
      this.close();
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }
}

function promptForProjectTemplateTab(
  app: App,
  language: Language,
  onSubmit: (value: string, type: FileTemplateTabType) => Promise<void>,
  initialValue = "",
  titleKey = "projectSend.addTagTab",
  submitKey = "projectSend.addTagTab"
): Promise<void> {
  new ProjectTemplateTabModal(app, language, onSubmit, initialValue, titleKey, submitKey).open();
  return Promise.resolve();
}

class FileTemplateGroupTabModal extends Modal {
  private input!: HTMLInputElement;

  constructor(
    app: App,
    private readonly language: Language,
    private readonly onSubmit: (value: string) => Promise<void>,
    private readonly initialValue = ""
  ) {
    super(app);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "FileTemplateGroupTabModal");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal");
    contentEl.createEl("h2", { text: t(this.language, "fileTemplateLibrary.addGroupTab") });
    this.input = contentEl.createEl("input", {
      cls: "memos-plus-project-name-input",
      attr: {
        type: "text",
        placeholder: t(this.language, "fileTemplateLibrary.addGroupTabPrompt")
      }
    });
    this.input.value = this.initialValue;

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    const cancel = footer.createEl("button", { attr: { type: "button" }, text: t(this.language, "modal.cancel") });
    const save = footer.createEl("button", {
      cls: "memos-plus-save-button",
      attr: { type: "button" },
      text: t(this.language, "fileTemplateLibrary.addGroupTab")
    });
    cancel.addEventListener("click", () => this.close());
    save.addEventListener("click", () => void withMobileClickLock(save, () => this.submit(save)));
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void withMobileClickLock(save, () => this.submit(save));
      }
    });
    focusOnDesktopOnly(this.input);
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "FileTemplateGroupTabModal");
    this.contentEl.empty();
  }

  private async submit(button: HTMLButtonElement): Promise<void> {
    const value = this.input.value.trim();
    if (!value) {
      focusOnDesktopOnly(this.input);
      return;
    }
    button.disabled = true;
    try {
      await this.onSubmit(value);
      this.close();
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }
}

function promptForFileTemplateGroupTab(
  app: App,
  language: Language,
  onSubmit: (value: string) => Promise<void>,
  initialValue = ""
): Promise<void> {
  new FileTemplateGroupTabModal(app, language, onSubmit, initialValue).open();
  return Promise.resolve();
}

class FileTemplateLibraryModal extends Modal {
  private items: FileTemplateLibraryItem[] = [];
  private selectedPath = "";
  private activeLibraryTabId = FILE_TEMPLATE_LIBRARY_TAB_ALL;
  private draftTitle = "";
  private titleInput!: HTMLInputElement;
  private listEl!: HTMLElement;
  private closed = false;
  private renderToken = 0;

  constructor(
    app: App,
    private readonly options: {
      language: Language;
      initialTitle: string;
      initialTag?: string;
      preferredPath?: string;
      fileTemplateTabs: FileTemplateTab[];
      defaultTabId: string;
      tabOrder: string[];
      performanceSettings: ModalPerformanceSettings;
      onLoad: () => Promise<FileTemplateLibraryItem[]>;
      onCreate: (template: FileTemplateLibraryItem, title: string) => Promise<void>;
      onDelete: (templatePath: string) => Promise<void>;
      onSaveTabs: (tabs: FileTemplateTab[]) => Promise<void>;
      onSaveFileTemplateLibraryPreferences?: (state: { defaultTabId?: string; tabOrder?: string[] }) => Promise<void>;
    }
  ) {
    super(app);
    this.selectedPath = options.preferredPath ?? "";
    this.draftTitle = options.initialTitle.trim();
    this.activeLibraryTabId = normalizeVisibleFileTemplateLibraryDefaultTabId(options.defaultTabId, options.fileTemplateTabs);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "FileTemplateLibraryModal");
    this.closed = false;
    this.modalEl.addClass("memos-plus-file-template-modal-shell");
    void this.load();
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "FileTemplateLibraryModal");
    this.closed = true;
    this.nextRenderToken();
    this.items = [];
    this.contentEl.empty();
  }

  private nextRenderToken(): number {
    this.renderToken += 1;
    return this.renderToken;
  }

  private isRenderTokenCurrent(token: number, element?: HTMLElement): boolean {
    return !this.closed && token === this.renderToken && (!element || element.isConnected);
  }

  private modalResultLimit(): number {
    return modalResultLimit(this.options.performanceSettings, Platform.isMobile);
  }

  private async load(): Promise<void> {
    const renderToken = this.nextRenderToken();
    const { contentEl } = this;
    const lang = this.options.language;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-file-template-modal");
    contentEl.createEl("h2", { text: t(lang, "fileTemplateLibrary.title") });
    contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
    try {
      this.items = await this.options.onLoad();
    } catch (error) {
      console.error("[Memos Plus] Failed to load file templates", error);
      if (this.isRenderTokenCurrent(renderToken, contentEl)) {
        contentEl.empty();
        contentEl.addClass("memos-plus-modal", "memos-plus-file-template-modal");
        contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileTemplateLibrary.empty") });
      }
      return;
    }
    if (!this.isRenderTokenCurrent(renderToken, contentEl)) {
      return;
    }
    if (!this.items.some((item) => item.path === this.selectedPath)) {
      this.selectedPath = this.items[0]?.path ?? "";
    }
    this.render();
  }

  private render(): void {
    if (this.closed) {
      return;
    }
    const { contentEl } = this;
    const lang = this.options.language;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-file-template-modal");
    contentEl.createEl("h2", { text: t(lang, "fileTemplateLibrary.title") });

    this.renderCategoryTabs(contentEl);
    this.titleInput = createTextField(contentEl, t(lang, "fileTemplateLibrary.fileName"), t(lang, "projectSend.projectNamePlaceholder"));
    this.titleInput.value = this.draftTitle;
    this.listEl = contentEl.createDiv({ cls: "memos-plus-file-template-list" });
    this.renderList();

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    footer.createEl("button", { attr: { type: "button" }, text: t(lang, "modal.cancel") }).addEventListener("click", () => this.close());
    const create = footer.createEl("button", {
      cls: "memos-plus-save-button",
      attr: { type: "button" },
      text: t(lang, "fileTemplateLibrary.createFile")
    });
    create.addEventListener("click", () => void withMobileClickLock(create, () => this.submit(create)));
    this.titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void withMobileClickLock(create, () => this.submit(create));
      }
    });
    this.titleInput.addEventListener("input", () => {
      this.draftTitle = this.titleInput.value;
    });
    focusOnDesktopOnly(this.titleInput);
  }

  private renderCategoryTabs(container: HTMLElement): void {
    const lang = this.options.language;
    const tabs = container.createDiv({ cls: "memos-plus-file-template-tabs" });
    for (const tab of this.libraryTabs()) {
      const isActive = tab.id === this.activeLibraryTabId;
      const button = tabs.createEl("button", {
        cls: `memos-plus-file-template-tab${isActive ? " is-active" : ""}`,
        attr: { type: "button", "aria-pressed": String(isActive), "data-tab-id": tab.id },
        text: tab.label
      });
      button.addEventListener("click", () => {
        this.activeLibraryTabId = tab.id;
        this.render();
      });
    }
    const add = tabs.createEl("button", {
      cls: "memos-plus-file-template-tab memos-plus-file-template-tab-add",
      attr: { type: "button", title: t(lang, "fileTemplateLibrary.addGroupTab") }
    });
    setIcon(add, "plus");
    add.addEventListener("click", () => {
      void withMobileClickLock(add, () => promptForFileTemplateGroupTab(
        this.app,
        lang,
        async (value) => {
          await this.addTemplateTab(value);
        }
      ));
    });
  }

  private renderList(): void {
    if (this.closed) {
      return;
    }
    const lang = this.options.language;
    this.listEl.empty();
    const items = this.currentLibraryItems().slice(0, this.modalResultLimit());
    const activeTab = this.activeLibraryTab();
    if (items.length === 0) {
      this.listEl.createDiv({
        cls: "memos-plus-project-empty",
        text: activeTab?.customTab ? t(lang, "fileTemplateLibrary.emptyGroup") : t(lang, "fileTemplateLibrary.empty")
      });
      return;
    }
    if (!items.some((item) => item.path === this.selectedPath)) {
      this.selectedPath = items[0]?.path ?? "";
    }
    for (const item of items) {
      const row = this.listEl.createDiv({
        cls: `memos-plus-file-template-item${item.path === this.selectedPath ? " is-selected" : ""}`
      });
      row.setAttr("role", "button");
      row.setAttr("tabindex", "0");
      row.setAttr("aria-pressed", String(item.path === this.selectedPath));
      const info = row.createDiv({ cls: "memos-plus-file-template-item-info" });
      const title = info.createDiv({ cls: "memos-plus-file-template-item-title" });
      setIcon(title.createSpan({ cls: "memos-plus-file-template-icon" }), "file-plus");
      const name = title.createSpan({ cls: "memos-plus-file-template-item-name", text: item.name });
      name.setAttr("title", item.name);
      const metaText = [item.category, item.tags.map((tag) => `#${tag}`).join(" "), formatUpdatedAt(item.updatedAt, lang)].filter(Boolean).join(" · ");
      const meta = info.createDiv({
        cls: "memos-plus-file-template-item-meta",
        text: metaText
      });
      meta.setAttr("title", metaText);

      const actions = row.createDiv({ cls: "memos-plus-file-template-actions" });
      const more = actions.createEl("button", {
        cls: "memos-plus-icon-button",
        attr: { type: "button", title: t(lang, "memo.more") }
      });
      setIcon(more, "more-horizontal");
      more.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openItemMenu(event, item);
      });
      const selectItem = (): void => {
        this.selectedPath = item.path;
        this.renderList();
      };
      row.addEventListener("click", selectItem);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectItem();
        }
      });
    }
  }

  private currentLibraryItems(): FileTemplateLibraryItem[] {
    const activeTab = this.activeLibraryTab();
    return activeTab?.customTab
      ? filterFileTemplateLibraryItemsForTab(this.items, activeTab.customTab)
      : filterFileTemplateLibraryItems(this.items, { category: "全部" });
  }

  private libraryTabs(): Array<{ id: string; label: string; customTab: FileTemplateTab | null }> {
    const ids = getVisibleFileTemplateLibraryTabIds(this.options.fileTemplateTabs, this.options.tabOrder);
    return ids.map((id) => {
      if (id === FILE_TEMPLATE_LIBRARY_TAB_ALL) {
        return { id, label: t(this.options.language, "fileTemplateLibrary.category.all"), customTab: null };
      }
      const tab = getFileTemplateLibraryTemplateGroupTab(id, this.options.fileTemplateTabs);
      return { id, label: tab?.name ?? id, customTab: tab };
    });
  }

  private activeLibraryTab(): { id: string; label: string; customTab: FileTemplateTab | null } | null {
    const tabs = this.libraryTabs();
    const active = tabs.find((tab) => tab.id === this.activeLibraryTabId) ?? tabs[0] ?? null;
    this.activeLibraryTabId = active?.id ?? FILE_TEMPLATE_LIBRARY_TAB_ALL;
    return active;
  }

  private async addTemplateTab(value: string): Promise<void> {
    const tab = createTemplateGroupFileTemplateTab(value);
    if (!tab) {
      return;
    }
    const tabs = normalizeFileTemplateTabs([...this.options.fileTemplateTabs, tab]);
    await this.saveTemplateTabs(tabs);
    const tabId = getFileTemplateLibraryTemplateGroupTabId(tab.id);
    this.activeLibraryTabId = tabId || FILE_TEMPLATE_LIBRARY_TAB_ALL;
    await this.options.onSaveFileTemplateLibraryPreferences?.({
      defaultTabId: this.activeLibraryTabId,
      tabOrder: getVisibleFileTemplateLibraryTabIds(tabs, [...this.options.tabOrder, tabId])
    });
    this.options.tabOrder = getVisibleFileTemplateLibraryTabIds(tabs, [...this.options.tabOrder, tabId]);
    this.options.defaultTabId = this.activeLibraryTabId;
    this.render();
  }

  private async saveTemplateTabs(tabs: FileTemplateTab[]): Promise<void> {
    this.options.fileTemplateTabs = normalizeFileTemplateTabs(tabs);
    await this.options.onSaveTabs(this.options.fileTemplateTabs);
  }

  private openItemMenu(event: MouseEvent, item: FileTemplateLibraryItem): void {
    const lang = this.options.language;
    const menu = new Menu();
    menu.addItem((menuItem) => {
      menuItem
        .setTitle(t(lang, "fileTemplateLibrary.openTemplate"))
        .setIcon("file-pen")
        .onClick(() => {
          if (item.file) {
            void this.app.workspace.getLeaf(false).openFile(item.file);
          }
        });
    });
    menu.addItem((menuItem) => {
      menuItem
        .setTitle(t(lang, "fileTemplateLibrary.deleteTemplate"))
        .setIcon("trash")
        .onClick(() => void this.deleteTemplate(item));
    });
    menu.showAtMouseEvent(event);
  }

  private async deleteTemplate(item: FileTemplateLibraryItem): Promise<void> {
    if (
      !(await confirmWithModal(this.app, {
        language: this.options.language,
        title: t(this.options.language, "fileTemplateLibrary.deleteTemplate"),
        message: t(this.options.language, "fileTemplateLibrary.deleteConfirm"),
        confirmText: t(this.options.language, "common.delete")
      }))
    ) {
      return;
    }
    try {
      await this.options.onDelete(item.path);
      this.items = await this.options.onLoad();
      if (this.closed) {
        return;
      }
      if (this.selectedPath === item.path) {
        this.selectedPath = this.items[0]?.path ?? "";
      }
      this.render();
    } catch (error) {
      console.error("[Memos Plus] Failed to delete file template", error);
    }
  }

  private async submit(button: HTMLButtonElement): Promise<void> {
    const title = this.titleInput.value.trim();
    this.draftTitle = this.titleInput.value;
    if (!title) {
      focusOnDesktopOnly(this.titleInput);
      return;
    }
    const currentItems = this.currentLibraryItems();
    const template = currentItems.find((item) => item.path === this.selectedPath) ?? currentItems[0] ?? this.items[0];
    if (!template) {
      return;
    }
    button.disabled = true;
    try {
      await this.options.onCreate(template, title);
      this.close();
    } catch (error) {
      console.error("[Memos Plus] Failed to create file from template library", error);
      new Notice(t(this.options.language, "fileTemplateLibrary.createFailed"));
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }
}

export class ProjectSendModal extends Modal {
  private settled = false;
  private mode: SendMode;
  private tagQuery = "";
  private fileQuery = "";
  private fileTemplateTabs: FileTemplateTab[] = [];
  private tabOrder: string[] = [];
  private hiddenTabs: string[] = [];
  private activeFileTemplateTabId = "";
  private currentTemplateId = "";
  private readonly taggedFilesCache = new Map<string, TaggedFileInfo[]>();
  private recentFilesCache: TaggedFileInfo[] | null = null;
  private readonly fileSearchCache = new Map<string, TaggedFileInfo[]>();
  private readonly fileHeadingsCache = new Map<string, FileHeadingInfo[]>();
  private readonly tabSearchQueries = new Map<string, string>();
  private draggedTabId = "";
  private closed = false;
  private renderToken = 0;

  constructor(app: App, private readonly options: ProjectSendModalOptions) {
    super(app);
    this.mode = "search";
    this.currentTemplateId = options.initialTemplateId ?? options.templates[0]?.id ?? "";
    this.tagQuery = options.defaultFileTag;
    this.fileTemplateTabs = normalizeFileTemplateTabs(options.fileTemplateTabs);
    if (this.fileTemplateTabs.length === 0 && options.customTagTabs) {
      this.fileTemplateTabs = legacyProjectSendTagsToFileTemplateTabs(options.customTagTabs);
    }
    this.tabOrder = normalizeTabOrder(options.tabOrder, this.fileTemplateTabs);
    this.hiddenTabs = normalizeHiddenTabs(options.hiddenTabs, this.fileTemplateTabs);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "ProjectSendModal");
    this.closed = false;
    this.modalEl.addClass("memos-plus-project-send-modal-shell");
    this.contentEl.addClass("memos-plus-modal", "memos-plus-project-send-modal");
    this.contentEl.scrollLeft = 0;
    this.renderCurrentMode();
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "ProjectSendModal");
    this.closed = true;
    this.nextRenderToken();
    this.taggedFilesCache.clear();
    this.recentFilesCache = null;
    this.fileSearchCache.clear();
    this.fileHeadingsCache.clear();
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.options.onChoose(null);
    }
  }

  private nextRenderToken(): number {
    this.renderToken += 1;
    return this.renderToken;
  }

  private isRenderTokenCurrent(token: number, element?: HTMLElement): boolean {
    return !this.closed && token === this.renderToken && (!element || element.isConnected);
  }

  private modalResultLimit(): number {
    return modalResultLimit(this.options.performanceSettings, Platform.isMobile);
  }

  private modalDebounceDelay(): number {
    return modalDebounceDelay(this.options.performanceSettings, Platform.isMobile);
  }

  private async loadTaggedFilesCached(tag: string): Promise<TaggedFileInfo[]> {
    const key = normalizeFileTag(tag);
    const cached = this.taggedFilesCache.get(key);
    if (cached) {
      return cached;
    }
    const files = await this.options.onLoadTaggedFiles(tag);
    this.taggedFilesCache.set(key, files);
    return files;
  }

  private async loadRecentFilesCached(): Promise<TaggedFileInfo[]> {
    if (this.recentFilesCache) {
      return this.recentFilesCache;
    }
    const files = await this.options.onLoadRecentFiles();
    this.recentFilesCache = files;
    return files;
  }

  private async searchFilesCached(query: string): Promise<TaggedFileInfo[]> {
    const key = query.trim().toLowerCase();
    const cached = this.fileSearchCache.get(key);
    if (cached) {
      return cached;
    }
    const files = await this.options.onSearchFiles(query);
    this.fileSearchCache.set(key, files);
    return files;
  }

  private async loadHeadingsCached(file: TFile): Promise<FileHeadingInfo[]> {
    const cached = this.fileHeadingsCache.get(file.path);
    if (cached) {
      return cached;
    }
    const headings = await this.options.onLoadHeadings(file);
    this.fileHeadingsCache.set(file.path, headings);
    return headings;
  }

  private renderCurrentMode(): void {
    if (this.closed) {
      return;
    }
    this.ensureActiveTabVisible();
    if (this.mode === "custom-tag" && this.activeFileTemplateTabId) {
      void this.renderFileTemplateTab(this.activeFileTemplateTabId);
      return;
    }
    void this.renderFileSearch();
  }

  private renderDefaultMemoTemplate(): void {
    const lang = this.options.language;
    const contentEl = this.renderShell();
    contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "projectSend.directSend") });
    if (this.options.onSaveDefault) {
      const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
      this.renderDirectSendButton(footer);
    }
  }

  private renderShell(): HTMLElement {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.scrollLeft = 0;
    this.renderModeTabs(contentEl);
    return contentEl;
  }

  private currentTemplate(): ManagedTemplate | undefined {
    return this.options.templates.find((template) => template.id === this.currentTemplateId) ?? this.options.templates[0];
  }

  private findTagFilterTab(tagValue: string): FileTemplateTab | undefined {
    const tag = normalizeFileTag(tagValue);
    if (!tag) {
      return undefined;
    }
    return this.fileTemplateTabs.find((tab) => tab.type === "tag-filter" && tab.tags.includes(tag));
  }

  private renderModeTabs(container: HTMLElement): void {
    const lang = this.options.language;
    const tabs = container.createDiv({ cls: "memos-plus-project-send-tabs" });
    for (const id of this.visibleTabIds()) {
      const isActive = this.activeTabId() === id;
      const button = tabs.createEl("button", {
        cls: `memos-plus-project-send-tab${isActive ? " is-active" : ""}`,
        attr: {
          type: "button",
          "aria-pressed": String(isActive)
        }
      });
      button.createSpan({ cls: "memos-plus-project-send-tab-label", text: this.tabLabel(id) });
      const customTab = getCustomTabFromTabId(id, this.fileTemplateTabs);
      if (customTab && !this.isMobileTemplateTabsReadOnly()) {
        button.setAttr("title", t(lang, "projectSend.removeTagTabHint"));
        const close = button.createSpan({ cls: "memos-plus-project-send-tab-close", attr: { "aria-label": t(lang, "projectSend.removeTagTab") } });
        setIcon(close, "x");
        close.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void withMobileClickLock(close, () => this.removeFileTemplateTab(customTab.id));
        });
        button.addEventListener("contextmenu", (event) => this.openFileTemplateTabMenu(event, customTab));
      }
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.openTab(id)));
      if (this.canReorderTabs()) {
        button.setAttr("draggable", "true");
        button.addEventListener("dragstart", (event) => this.startTabDrag(event, id, button));
        button.addEventListener("dragover", (event) => {
          event.preventDefault();
        });
        button.addEventListener("drop", (event) => void this.dropTab(event, id));
        button.addEventListener("dragend", () => {
          this.draggedTabId = "";
          button.classList.remove("is-dragging");
        });
      }
    }
    if (this.options.enableFileTargets && !this.isMobileTemplateTabsReadOnly()) {
      const add = tabs.createEl("button", {
        cls: "memos-plus-project-send-tab memos-plus-project-send-tab-add",
        attr: { type: "button", "aria-label": t(lang, "projectSend.addTagTab"), title: t(lang, "projectSend.addTagTab") }
      });
      setIcon(add, "plus");
      add.addEventListener("click", () => void withMobileClickLock(add, () => this.addFileTemplateTab()));
    }
  }

  private visibleTabIds(): string[] {
    const hidden = new Set(this.hiddenTabs);
    const ids = normalizeTabOrder(this.tabOrder, this.fileTemplateTabs).filter((id) => !hidden.has(id));
    const available = ids.filter((id) => id === "search" || getCustomTabFromTabId(id, this.fileTemplateTabs));
    return available.length > 0 ? available : ["search"];
  }

  private activeTabId(): string {
    if (this.mode === "custom-tag" && this.activeFileTemplateTabId) {
      return getCustomTabId(this.activeFileTemplateTabId);
    }
    return this.mode;
  }

  private tabLabel(id: string): string {
    const customTab = getCustomTabFromTabId(id, this.fileTemplateTabs);
    if (customTab) {
      return customTab.name;
    }
    if (isFixedSendMode(id)) {
      return t(this.options.language, `fileSend.mode.${id}`);
    }
    return id;
  }

  private ensureActiveTabVisible(): void {
    const visible = this.visibleTabIds();
    const active = this.activeTabId();
    if (visible.includes(active)) {
      return;
    }
    const fallback = visible[0] ?? "search";
    const customTab = getCustomTabFromTabId(fallback, this.fileTemplateTabs);
    if (customTab) {
      this.mode = "custom-tag";
      this.activeFileTemplateTabId = customTab.id;
      return;
    }
    this.mode = "search";
    this.activeFileTemplateTabId = "";
  }

  private async openTab(id: string): Promise<void> {
    const customTab = getCustomTabFromTabId(id, this.fileTemplateTabs);
    if (customTab) {
      await this.openFileTemplateTab(customTab.id);
      return;
    }
    if (!isFixedSendMode(id)) {
      return;
    }
    this.mode = id;
    this.activeFileTemplateTabId = "";
    void this.renderFileSearch();
  }

  private startTabDrag(event: DragEvent, id: string, button: HTMLButtonElement): void {
    this.draggedTabId = id;
    button.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  }

  private async dropTab(event: DragEvent, targetId: string): Promise<void> {
    event.preventDefault();
    const sourceId = this.draggedTabId || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetId) {
      return;
    }
    const order = normalizeTabOrder(this.tabOrder, this.fileTemplateTabs);
    const from = order.indexOf(sourceId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) {
      return;
    }
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    this.tabOrder = normalizeTabOrder(next, this.fileTemplateTabs);
    await this.persistTabPreferences();
    this.renderCurrentMode();
  }

  private async persistTabPreferences(): Promise<void> {
    this.tabOrder = normalizeTabOrder(this.tabOrder, this.fileTemplateTabs);
    this.hiddenTabs = normalizeHiddenTabs(this.hiddenTabs, this.fileTemplateTabs);
    await this.options.onSaveTabPreferences({ tabOrder: [...this.tabOrder], hiddenTabs: [...this.hiddenTabs] });
  }

  private canReorderTabs(): boolean {
    return canReorderTemplateTabs(this.options.fileTemplateTabInteraction);
  }

  private isMobileTemplateTabsReadOnly(): boolean {
    return isMobileTemplateTabsReadOnly(this.options.fileTemplateTabInteraction);
  }

  private async renderFileTemplateTab(tabId: string): Promise<void> {
    const tab = this.fileTemplateTabs.find((item) => item.id === tabId);
    if (!tab) {
      this.mode = "search";
      this.activeFileTemplateTabId = "";
      void this.renderFileSearch();
      return;
    }
    if (tab.type === "template-group") {
      await this.renderTemplateGroupTab(tab);
      return;
    }
    await this.renderCustomTagFiles(tab);
  }

  private async renderCustomTagFiles(tab: FileTemplateTab): Promise<void> {
    const lang = this.options.language;
    this.mode = "custom-tag";
    this.activeFileTemplateTabId = tab.id;
    this.tagQuery = tab.tags[0] ?? tab.name;
    this.renderShell().createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
    const renderToken = this.nextRenderToken();
    let files: TaggedFileInfo[] = [];
    try {
      files = await this.loadTaggedFileTabResults(tab);
    } catch (error) {
      console.error("[Memos Plus] Failed to load custom tag files", error);
    }
    if (this.mode !== "custom-tag" || this.activeFileTemplateTabId !== tab.id || !this.isRenderTokenCurrent(renderToken, this.contentEl)) {
      return;
    }
    this.renderCustomTagFilesContent(tab, files);
  }

  private renderCustomTagFilesContent(tab: FileTemplateTab, files: TaggedFileInfo[]): void {
    const contentEl = this.renderShell();
    const tabKey = getCustomTabId(tab.id);
    const list = contentEl.createDiv({ cls: "memos-plus-project-list" });
    const renderList = (): void => {
      this.renderScopedTagFileList(list, files, () => void this.renderFileTemplateTab(tab.id), tab.tags[0] ?? "", tabKey);
    };
    this.renderScopedTabSearchInput(contentEl, this.tabLabel(tabKey), tabKey, renderList);
    contentEl.appendChild(list);
    renderList();
    this.renderQuickCreateFooter(contentEl);
  }

  private async renderTemplateGroupTab(tab: FileTemplateTab): Promise<void> {
    const lang = this.options.language;
    this.mode = "custom-tag";
    this.activeFileTemplateTabId = tab.id;
    const contentEl = this.renderShell();
    contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
    const renderToken = this.nextRenderToken();
    let templates: FileTemplateLibraryItem[] = [];
    try {
      templates = await this.options.onLoadFileTemplates();
    } catch (error) {
      console.error("[Memos Plus] Failed to load template group tab", error);
    }
    if (this.mode !== "custom-tag" || this.activeFileTemplateTabId !== tab.id || !this.isRenderTokenCurrent(renderToken, contentEl)) {
      return;
    }
    this.renderTemplateGroupTabContent(tab, templates);
  }

  private renderTemplateGroupTabContent(tab: FileTemplateTab, templates: FileTemplateLibraryItem[]): void {
    const contentEl = this.renderShell();
    const tabKey = getCustomTabId(tab.id);
    const list = contentEl.createDiv({ cls: "memos-plus-file-template-list memos-plus-template-group-tab-list" });
    const renderList = (): void => {
      this.renderScopedTemplateGroupList(list, templates, tab, tabKey);
    };
    this.renderScopedTabSearchInput(contentEl, this.tabLabel(tabKey), tabKey, renderList);
    contentEl.appendChild(list);
    renderList();
    this.renderQuickCreateFooter(contentEl);
  }

  private renderScopedTabSearchInput(container: HTMLElement, tabLabel: string, tabKey: string, onSearch: () => void): HTMLInputElement {
    const search = container.createEl("input", {
      cls: "memos-plus-project-search memos-plus-project-tab-search",
      attr: {
        type: "search",
        placeholder: t(this.options.language, "fileSend.searchInTab").replace("{tab}", tabLabel)
      }
    });
    search.value = this.tabSearchQueries.get(tabKey) ?? "";
    const renderDebounced = debounce(onSearch, this.modalDebounceDelay());
    search.addEventListener("input", () => {
      this.tabSearchQueries.set(tabKey, search.value);
      renderDebounced();
    });
    return search;
  }

  private renderScopedTagFileList(
    list: HTMLElement,
    files: TaggedFileInfo[],
    refresh: () => void,
    createTag: string,
    tabKey: string
  ): void {
    list.empty();
    const query = this.tabSearchQueries.get(tabKey) ?? "";
    const filtered = filterTaggedFilesByQuery(files, query);
    this.renderFileListItems(list, filtered, refresh, undefined, createTag, !query.trim());
    if (filtered.length === 0 && query.trim()) {
      list.empty();
      list.createDiv({ cls: "memos-plus-project-empty", text: t(this.options.language, "fileSend.noFilesInTab") });
    }
  }

  private renderScopedTemplateGroupList(list: HTMLElement, templates: FileTemplateLibraryItem[], tab: FileTemplateTab, tabKey: string): void {
    const lang = this.options.language;
    list.empty();
    const query = this.tabSearchQueries.get(tabKey) ?? "";
    const items = filterTemplateItemsByQuery(filterFileTemplateLibraryItemsForTab(templates, tab), query).slice(0, this.modalResultLimit());
    if (items.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: query.trim() ? t(lang, "fileSend.noFilesInTab") : t(lang, "fileTemplateLibrary.emptyGroup") });
      return;
    }
    for (const item of items) {
      const row = this.renderTemplateGroupOption(list, item);
      row.addEventListener("click", () => void withMobileClickLock(row, () => this.openFileTemplateLibraryModal("", item.path)));
    }
  }

  private async loadTaggedFileTabResults(tab: FileTemplateTab): Promise<TaggedFileInfo[]> {
    const byPath = new Map<string, TaggedFileInfo>();
    for (const tag of tab.tags) {
      for (const file of await this.loadTaggedFilesCached(tag)) {
        byPath.set(file.path, file);
      }
    }
    return [...byPath.values()].sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  }

  private renderTemplateGroupOption(container: HTMLElement, item: FileTemplateLibraryItem): HTMLElement {
    const row = container.createDiv({ cls: "memos-plus-file-template-item" });
    row.setAttr("role", "button");
    row.setAttr("tabindex", "0");
    const info = row.createDiv({ cls: "memos-plus-file-template-item-info" });
    const title = info.createDiv({ cls: "memos-plus-file-template-item-title" });
    setIcon(title.createSpan({ cls: "memos-plus-file-template-icon" }), "file-plus");
    title.createSpan({ cls: "memos-plus-file-template-item-name", text: item.name });
    info.createDiv({
      cls: "memos-plus-file-template-item-meta",
      text: [item.category, item.tags.map((tag) => `#${tag}`).join(" "), formatUpdatedAt(item.updatedAt, this.options.language)].filter(Boolean).join(" · ")
    });
    return row;
  }

  private async renderFileSearch(): Promise<void> {
    const lang = this.options.language;
    const contentEl = this.renderShell();
    const search = contentEl.createEl("input", {
      cls: "memos-plus-project-search",
      attr: { type: "search", placeholder: t(lang, "fileSend.searchFiles") }
    });
    search.value = this.fileQuery;
    const list = contentEl.createDiv({ cls: "memos-plus-project-list memos-plus-project-search-results" });
    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer memos-plus-project-search-footer" });
    if (this.options.onSaveDefault) {
      this.renderDirectSendButton(footer);
    }
    const createFile = this.renderFileSearchCreateButton(footer);
    const renderDebounced = debounce(() => {
      void this.renderFileSearchContent(list);
    }, this.modalDebounceDelay());
    search.addEventListener("input", () => {
      this.fileQuery = search.value;
      this.updateFileSearchCreateButton(createFile);
      renderDebounced();
    });
    void this.renderFileSearchContent(list);
  }

  private async renderFileSearchContent(list: HTMLElement): Promise<void> {
    const renderToken = this.nextRenderToken();
    const query = this.fileQuery;
    if (!this.isRenderTokenCurrent(renderToken, list)) {
      return;
    }
    list.empty();
    if (this.shouldShowMobileRecentFileTargets(query)) {
      await this.renderMobileRecentFileTargets(list, renderToken, query);
      return;
    }
    const cached = this.fileSearchCache.get(query.trim().toLowerCase());
    if (cached) {
      if (!this.isRenderTokenCurrent(renderToken, list)) {
        return;
      }
      this.renderFileListItems(list, cached, () => void this.renderFileSearch(), undefined, "", false);
      return;
    }
    list.createDiv({ cls: "memos-plus-project-empty", text: t(this.options.language, "common.loading") });
    let files: TaggedFileInfo[] = [];
    try {
      files = await this.searchFilesCached(query);
    } catch (error) {
      console.error("[Memos Plus] Failed to search files", error);
    }
    if (query !== this.fileQuery || !this.isRenderTokenCurrent(renderToken, list)) {
      return;
    }
    list.empty();
    this.renderFileListItems(list, files, () => void this.renderFileSearch(), undefined, "", false);
  }

  private async renderMobileRecentFileTargets(list: HTMLElement, renderToken: number, query: string): Promise<void> {
    const lang = this.options.language;
    const cached = this.recentFilesCache;
    if (cached) {
      const recentFiles = cached.slice(0, MOBILE_EMPTY_SEARCH_RECENT_FILE_LIMIT);
      if (recentFiles.length === 0) {
        list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileSend.noRecentFilesSearchHint") });
        return;
      }
      this.renderFileListItems(list, recentFiles, () => void this.renderFileSearch(), undefined, "", false);
      return;
    }
    list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
    let files: TaggedFileInfo[] = [];
    try {
      files = await this.loadRecentFilesCached();
    } catch (error) {
      console.error("[Memos Plus] Failed to load recent file targets", error);
    }
    if (query !== this.fileQuery || !this.isRenderTokenCurrent(renderToken, list)) {
      return;
    }
    list.empty();
    const recentFiles = files.slice(0, MOBILE_EMPTY_SEARCH_RECENT_FILE_LIMIT);
    if (recentFiles.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileSend.noRecentFilesSearchHint") });
      return;
    }
    this.renderFileListItems(list, recentFiles, () => void this.renderFileSearch(), undefined, "", false);
  }

  private shouldShowMobileRecentFileTargets(query: string): boolean {
    return Platform.isMobile && !query.trim();
  }

  private renderFileList(files: TaggedFileInfo[], title: string, refresh: () => void, back?: () => void, createTag = ""): void {
    const contentEl = back ? this.renderFileStepHeader(title, back) : this.renderShell();
    this.renderFileListContent(contentEl, files, refresh, back, createTag);
  }

  private renderFileListContent(contentEl: HTMLElement, files: TaggedFileInfo[], refresh: () => void, back?: () => void, createTag = ""): void {
    const list = contentEl.createDiv({ cls: "memos-plus-project-list" });
    this.renderFileListItems(list, files, refresh, back, createTag);
  }

  private renderFileListItems(list: HTMLElement, files: TaggedFileInfo[], refresh: () => void, back?: () => void, createTag = "", showInlineCreate = true): void {
    const lang = this.options.language;
    if (files.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileSend.noFiles") });
      if (showInlineCreate) {
        this.renderTemplateCreateButton(list, createTag);
      }
    }
    for (const info of files.slice(0, this.modalResultLimit())) {
      const button = this.renderFileInfoOption(list, info);
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.renderHeadingPicker(info, refresh, back)));
    }
  }

  private renderFileInfoOption(container: HTMLElement, info: TaggedFileInfo): HTMLButtonElement {
    return this.renderSendListOption(container, {
      title: info.name,
      icon: "file-text",
      metaParts: this.fileMetaParts(info),
      titleAttr: info.path
    });
  }

  private renderSendListOption(
    container: HTMLElement,
    options: { title: string; icon?: string; metaParts: string[]; titleAttr?: string }
  ): HTMLButtonElement {
    const button = container.createEl("button", { cls: "memos-plus-project-option", attr: { type: "button" } });
    if (options.titleAttr) {
      button.setAttr("title", `${options.title}\n${options.titleAttr}`);
    }
    const title = button.createDiv({ cls: "memos-plus-project-option-title" });
    if (options.icon) {
      setIcon(title.createSpan({ cls: "memos-plus-file-target-icon" }), options.icon);
    }
    title.createSpan({ cls: "memos-plus-project-option-title-text", text: options.title });
    const metaParts = options.metaParts.filter(Boolean);
    if (metaParts.length > 0) {
      const metaEl = title.createSpan({ cls: "memos-plus-project-option-meta-inline" });
      const recentLabel = t(this.options.language, "projectSend.recent");
      const [firstPart, ...restParts] = metaParts;
      const textParts = firstPart === recentLabel ? restParts : metaParts;
      if (firstPart === recentLabel) {
        metaEl.createSpan({ cls: "memos-plus-project-recent", text: firstPart });
      }
      if (textParts.length > 0) {
        metaEl.createSpan({ cls: "memos-plus-project-option-meta-text", text: textParts.join(" · ") });
      }
      metaEl.setAttr("title", metaParts.join(" · "));
    }
    return button;
  }

  private fileMetaParts(info: TaggedFileInfo): string[] {
    return [info.status ?? "", compactFilePath(info.path), formatUpdatedAt(info.updatedAt, this.options.language)];
  }

  private async renderHeadingPicker(info: TaggedFileInfo, refresh: () => void, back?: () => void): Promise<void> {
    const lang = this.options.language;
    const contentEl = this.renderFileStepHeader(info.name, back ?? refresh);
    contentEl.createDiv({ cls: "memos-plus-project-section-hint", text: info.path });
    const renderToken = this.nextRenderToken();

    const position = createSelectField(contentEl, t(lang, "fileSend.selectPosition"), [
      ["heading-top", t(lang, "fileSend.position.headingTop")],
      ["heading-bottom", t(lang, "fileSend.position.headingBottom")],
      ["new-heading", t(lang, "fileSend.position.newHeading")],
      ["file-end", t(lang, "fileSend.position.fileEnd")],
      ["file-start", t(lang, "fileSend.position.fileStart")]
    ]);
    position.value = this.options.defaultFileInsertPosition;
    const newHeadingControls = contentEl.createDiv({ cls: "memos-plus-new-heading-options" });
    const newHeadingName = createTextField(newHeadingControls, t(lang, "fileSend.newHeadingName"), this.defaultInsertHeading());
    newHeadingName.value = this.defaultInsertHeading();
    const newHeadingLevel = createSelectField(
      newHeadingControls,
      t(lang, "fileSend.newHeadingLevel"),
      [1, 2, 3, 4, 5, 6].map((level) => [String(level), t(lang, `fileSend.headingLevel.${level}`)])
    );
    newHeadingLevel.value = "2";
    const newHeadingPosition = createSelectField(newHeadingControls, t(lang, "fileSend.newHeadingPosition"), [
      ["file-end", t(lang, "fileSend.newHeadingPosition.file-end")],
      ["file-start", t(lang, "fileSend.newHeadingPosition.file-start")],
      ["after-current-heading", t(lang, "fileSend.newHeadingPosition.after-current-heading")]
    ]);
    newHeadingPosition.value = "file-end";
    const existingHeadingBehavior = createSelectField(newHeadingControls, t(lang, "fileSend.existingHeadingBehavior"), [
      ["use-existing", t(lang, "fileSend.existingHeadingBehavior.use-existing")],
      ["create-duplicate", t(lang, "fileSend.existingHeadingBehavior.create-duplicate")],
      ["cancel", t(lang, "fileSend.existingHeadingBehavior.cancel")]
    ]);
    existingHeadingBehavior.value = "use-existing";
    const createHeading = newHeadingControls.createEl("button", {
      cls: "memos-plus-save-button",
      attr: { type: "button" },
      text: t(lang, "fileSend.position.newHeading")
    });
    const buildNewHeadingTarget = (currentHeading: string): Partial<FileSendTarget> => ({
      newHeadingName: newHeadingName.value.trim() || this.defaultInsertHeading(),
      newHeadingLevel: normalizeHeadingLevelValue(newHeadingLevel.value),
      newHeadingPosition: normalizeNewHeadingPositionValue(newHeadingPosition.value),
      existingHeadingBehavior: normalizeExistingHeadingBehaviorValue(existingHeadingBehavior.value),
      heading: currentHeading
    });
    createHeading.addEventListener("click", () =>
      void withMobileClickLock(createHeading, () =>
        this.handleFileTargetChoice(info.file, "", "new-heading", () => void this.renderHeadingPicker(info, refresh, back), false, buildNewHeadingTarget(""))
      )
    );
    const updateNewHeadingVisibility = (): void => {
      newHeadingControls.toggleClass("is-hidden", position.value !== "new-heading");
    };
    position.addEventListener("change", updateNewHeadingVisibility);
    updateNewHeadingVisibility();

    let headings: FileHeadingInfo[] = [];
    try {
      headings = await this.loadHeadingsCached(info.file);
    } catch (error) {
      console.error("[Memos Plus] Failed to load headings", error);
    }
    if (!this.isRenderTokenCurrent(renderToken, contentEl)) {
      return;
    }
    const list = contentEl.createDiv({ cls: "memos-plus-project-section-grid memos-plus-heading-target-grid" });
    if (headings.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileSend.noHeadings") });
      if (position.value !== "new-heading" && (this.options.noHeadingBehavior === "file-start" || this.options.noHeadingBehavior === "file-end")) {
        this.handleFileTargetChoice(info.file, "", this.options.noHeadingBehavior, () => void this.renderHeadingPicker(info, refresh, back));
        return;
      }
      this.renderFilePositionButtons(list, info.file, () => void this.renderHeadingPicker(info, refresh, back), true);
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
            () => void this.renderHeadingPicker(info, refresh, back),
            false,
            selectedPosition === "new-heading" ? buildNewHeadingTarget(heading.heading) : {}
          );
        })
      );
    }

    this.renderFilePositionButtons(list, info.file, () => void this.renderHeadingPicker(info, refresh, back));
  }

  private renderFilePositionButtons(container: HTMLElement, file: TFile, backAction?: () => void, includeCreateHeading = false): void {
    const lang = this.options.language;
    for (const [position, label] of [
      ["file-end", t(lang, "fileSend.position.fileEnd")],
      ["file-start", t(lang, "fileSend.position.fileStart")]
    ] as Array<[FileInsertPosition, string]>) {
      const button = container.createEl("button", { cls: "memos-plus-project-section", attr: { type: "button" }, text: label });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.handleFileTargetChoice(file, "", position, backAction)));
    }
    if (includeCreateHeading) {
      const heading = this.defaultInsertHeading();
      const button = container.createEl("button", { cls: "memos-plus-project-section is-default", attr: { type: "button" }, text: `${t(lang, "fileSend.position.createHeading")}：${heading}` });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.handleFileTargetChoice(file, heading, "heading-top", backAction, true)));
    }
  }

  private renderFileStepHeader(title: string, backAction: () => void): HTMLElement {
    const lang = this.options.language;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.scrollLeft = 0;
    const header = contentEl.createDiv({ cls: "memos-plus-project-send-header" });
    const back = header.createEl("button", {
      cls: "memos-plus-icon-button",
      attr: { type: "button", "aria-label": t(lang, "projectSend.back"), title: t(lang, "projectSend.back") }
    });
    setIcon(back, "arrow-left");
    back.addEventListener("click", backAction);
    header.createEl("h2", { text: title });
    return contentEl;
  }

  private defaultInsertHeading(): string {
    return this.options.defaultHeading.trim() || "收集箱";
  }

  private handleFileTargetChoice(
    file: TFile,
    heading: string,
    position: FileInsertPosition,
    backAction?: () => void,
    createHeadingIfMissing = false,
    targetOptions: Partial<FileSendTarget> = {}
  ): void {
    const taskHeading = position === "new-heading" ? targetOptions.newHeadingName ?? heading : heading;
    const headingBoundTemplate = this.headingBoundTemplateForHeading(taskHeading);
    const template = this.templateForHeading(taskHeading);
    const decision = this.taskDecisionFor(taskHeading, template);
    const promptForHeadingBoundTask = shouldPromptForHeadingBoundTask(template, headingBoundTemplate, this.options.taskSettings.promptOnCreate);
    if (decision === "ask" || (decision === "task" && promptForHeadingBoundTask)) {
      this.renderTaskOptions(
        `${file.basename} · ${taskHeading || t(this.options.language, `fileSend.position.${position === "file-start" ? "fileStart" : position === "new-heading" ? "newHeading" : "fileEnd"}`)}`,
        backAction ?? (() => this.renderCurrentMode()),
        (task) => this.chooseFile(file, heading, position, template, task, createHeadingIfMissing, targetOptions),
        true,
        this.taskContentModeForTemplate(template)
      );
      return;
    }
    const task = decision === "task" ? this.defaultTaskOptions(template) : undefined;
    this.chooseFile(file, heading, position, template, task, createHeadingIfMissing, targetOptions);
  }

  private taskDecisionFor(heading: string, template = this.currentTemplate()): TemplateTaskDecision {
    return resolveTemplateTaskDecision(template, {
      content: this.options.content,
      heading
    });
  }

  private defaultTaskOptions(template = this.currentTemplate()): ProjectTaskOptions {
    return {
      isTask: true,
      priority: this.options.taskSettings.defaultPriority,
      scheduledDate: this.options.taskSettings.defaultScheduledDate,
      dueDate: this.options.taskSettings.defaultDueDate,
      recurrence: this.options.taskSettings.defaultRecurrence,
      addCreatedDate: this.options.taskSettings.addCreatedDate,
      contentMode: this.defaultTaskContentMode(template)
    };
  }

  private taskContentModeForTemplate(template = this.currentTemplate()): TaskContentMode {
    return template?.taskContentMode ?? "task-with-detail";
  }

  private defaultTaskContentMode(template = this.currentTemplate()): TaskContentMode {
    const mode = this.taskContentModeForTemplate(template);
    return mode === "ask" ? "task-with-detail" : mode;
  }

  private renderTaskOptions(title: string, backAction: () => void, onConfirm: (task?: ProjectTaskOptions) => void, defaultAsTask: boolean, taskContentMode: TaskContentMode = "task-with-detail"): void {
    const lang = this.options.language;
    const contentEl = this.renderFileStepHeader(t(lang, "projectSend.taskOptions"), backAction);
    contentEl.createDiv({ cls: "memos-plus-project-section-hint", text: title });

    const taskOptionsForm = createTaskOptionsForm(contentEl, {
      language: lang,
      taskSettings: this.options.taskSettings,
      defaultAsTask,
      taskContentMode,
      renderMetadataOptions: this.options.taskSettings.enabled
    });

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    const confirm = footer.createEl("button", { cls: "memos-plus-save-button", text: t(lang, "projectSend.confirm") });
    confirm.addEventListener("click", () => {
      void withMobileClickLock(confirm, () => onConfirm(taskOptionsForm.value()));
    });
  }

  private renderTemplateCreateButton(container: HTMLElement, tag = ""): void {
    const button = container.createEl("button", { cls: "memos-plus-project-add memos-plus-template-create-button", attr: { type: "button" } });
    setIcon(button, "plus");
    button.createSpan({ text: t(this.options.language, "fileTemplateLibrary.useTemplateCreate") });
    button.addEventListener("click", () => this.openFileTemplateLibraryModal(tag));
  }

  private renderFileSearchCreateButton(container: HTMLElement): HTMLButtonElement {
    const button = container.createEl("button", {
      cls: "memos-plus-project-add memos-plus-project-create-file",
      attr: { type: "button" }
    });
    setIcon(button, "file-plus");
    button.createSpan({ cls: "memos-plus-project-add-label" });
    this.updateFileSearchCreateButton(button);
    button.addEventListener("click", () => void withMobileClickLock(button, () => this.openFileTemplateLibraryModal()));
    return button;
  }

  private renderQuickCreateFooter(container: HTMLElement): void {
    if (!this.options.onSaveDefault && !this.options.enableFileTargets) {
      return;
    }
    const footer = container.createDiv({ cls: "memos-plus-project-footer memos-plus-project-search-footer" });
    if (this.options.onSaveDefault) {
      this.renderDirectSendButton(footer);
    }
    if (this.options.enableFileTargets) {
      const button = footer.createEl("button", {
        cls: "memos-plus-project-add memos-plus-project-create-file",
        attr: { type: "button", title: t(this.options.language, "projectSend.createFileFromSearchHint") }
      });
      setIcon(button, "file-plus");
      button.createSpan({ cls: "memos-plus-project-add-label", text: t(this.options.language, "projectSend.createFileFromSearch") });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.openQuickCreateForActiveTab()));
    }
  }

  private async openQuickCreateForActiveTab(): Promise<void> {
    if (this.activeTabId() === "search") {
      this.openFileTemplateLibraryModal();
      return;
    }
    const preferredPath = this.preferredTemplatePathForActiveTab();
    if (!preferredPath) {
      this.noticeMissingTabTemplate();
      return;
    }
    let templates: FileTemplateLibraryItem[] = [];
    try {
      templates = await this.options.onLoadFileTemplates();
    } catch (error) {
      console.error("[Memos Plus] Failed to validate tab quick-create template", error);
    }
    if (!templates.some((item) => item.path === preferredPath)) {
      this.noticeMissingTabTemplate();
      return;
    }
    const tab = getCustomTabFromTabId(this.activeTabId(), this.fileTemplateTabs);
    const tag = tab?.type === "tag-filter" ? tab.tags[0] ?? "" : "";
    this.openFileTemplateLibraryModal(tag, preferredPath);
  }

  private preferredTemplatePathForActiveTab(): string {
    return this.options.tabTemplateBindings?.[this.activeTabId()] ?? "";
  }

  private noticeMissingTabTemplate(): void {
    new Notice(t(this.options.language, "projectSend.tabTemplateMissing"));
    this.options.onOpenTabTemplateBindings?.(this.activeTabId());
  }

  private updateFileSearchCreateButton(button: HTMLButtonElement): void {
    const lang = this.options.language;
    const query = this.fileQuery.trim();
    const label =
      query && Platform.isMobile
        ? t(lang, "projectSend.createFileFromSearchMobile")
        : query
          ? t(lang, "projectSend.createFileFromSearchNamed").replace("{query}", query)
          : t(lang, "projectSend.createFileFromSearch");
    const title = t(lang, "projectSend.createFileFromSearchHint");
    button.setAttr("title", query ? `${title}：${query}` : title);
    const labelEl = button.querySelector<HTMLElement>(".memos-plus-project-add-label");
    labelEl?.setText(label);
  }

  private openFileTemplateLibraryModal(tag = "", preferredPathOverride = ""): void {
    this.nextRenderToken();
    logMemosPlusDiagnostic("modal:open-template-library", {
      from: "ProjectSendModal",
      activeTab: this.activeTabId(),
      tag,
      preferredPathOverride: Boolean(preferredPathOverride),
      queryLength: this.fileQuery.trim().length
    });
    new FileTemplateLibraryModal(this.app, {
      language: this.options.language,
      initialTitle: this.templateCreateTitle(tag),
      initialTag: tag,
      preferredPath: preferredPathOverride || this.options.getPreferredFileTemplatePath?.(tag) || this.options.preferredFileTemplatePath,
      fileTemplateTabs: this.fileTemplateTabs,
      defaultTabId: this.options.fileTemplateLibraryDefaultTabId,
      tabOrder: this.options.fileTemplateLibraryTabOrder,
      performanceSettings: this.options.performanceSettings,
      onLoad: this.options.onLoadFileTemplates,
      onDelete: this.options.onDeleteFileTemplate,
      onSaveTabs: async (tabs) => {
        await this.saveFileTemplateTabs(tabs);
      },
      onSaveFileTemplateLibraryPreferences: this.options.onSaveFileTemplateLibraryPreferences,
      onCreate: async (template, title) => {
        const file = await this.options.onCreateFromFileTemplate(template.path, title, tag);
        if (!file) {
          throw new Error("File template creation returned no file");
        }
        try {
          await this.options.onMarkFileTemplateRecent(template.path);
        } catch (error) {
          console.error("[Memos Plus] Failed to mark file template as recent", error);
        }
        logMemosPlusDiagnostic("modal:template-created-heading-picker", {
          from: "FileTemplateLibraryModal",
          file: file.path,
          template: template.path,
          tag
        });
        await this.renderCreatedFileHeadingPicker(file, tag);
      }
    }).open();
  }

  private async renderCreatedFileHeadingPicker(file: TFile, tag = ""): Promise<void> {
    const info = createdFileToTaggedFileInfo(file, tag);
    await this.renderHeadingPicker(info, () => void this.renderCreatedFileHeadingPicker(file, tag), () => this.renderCurrentMode());
  }

  private activeCreateFileQuery(): string {
    if (this.activeTabId() === "search") {
      return this.fileQuery.trim();
    }
    return this.tabSearchQueries.get(this.activeTabId())?.trim() ?? "";
  }

  private templateCreateTitle(tag = ""): string {
    return this.activeCreateFileQuery() || this.tagQuery.trim() || tag;
  }

  private chooseFile(
    file: TFile,
    heading: string,
    position: FileInsertPosition,
    template = this.currentTemplate(),
    task?: ProjectTaskOptions,
    createHeadingIfMissing = false,
    targetOptions: Partial<FileSendTarget> = {}
  ): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.options.onChoose({ file, section: heading, task, mode: "file", fileTarget: { heading, position, createHeadingIfMissing, ...targetOptions }, template });
    this.close();
  }

  private templateForHeading(heading: string): ManagedTemplate | undefined {
    return this.headingBoundTemplateForHeading(heading) ?? this.currentTemplate();
  }

  private headingBoundTemplateForHeading(heading: string): ManagedTemplate | undefined {
    return findManagedTemplateForHeading(this.options.templates, heading);
  }

  private renderDirectSendButton(container: HTMLElement): void {
    const lang = this.options.language;
    const direct = container.createEl("button", { cls: "memos-plus-project-add", attr: { type: "button" } });
    setIcon(direct, "send");
    direct.createSpan({ text: t(lang, "projectSend.directSend") });
    direct.addEventListener("click", () => void withMobileClickLock(direct, () => this.saveDefault(direct)));
  }

  private async saveDefault(button: HTMLButtonElement): Promise<void> {
    const onSaveDefault = this.options.onSaveDefault;
    if (!onSaveDefault) {
      return;
    }
    button.disabled = true;
    try {
      await onSaveDefault();
      this.settled = true;
      this.options.onChoose(null);
      this.close();
    } catch (error) {
      console.error("Memos Plus: failed to save memo to the default destination", error);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }

  private async openFileTemplateTab(tabId: string): Promise<void> {
    this.mode = "custom-tag";
    this.activeFileTemplateTabId = tabId;
    await this.renderFileTemplateTab(tabId);
  }

  private addFileTemplateTab(): Promise<void> {
    return promptForProjectTemplateTab(this.app, this.options.language, async (value, type) => {
      const tab = type === "template-group" ? createTemplateGroupFileTemplateTab(value) : createTagFilterFileTemplateTab(value);
      if (!tab) {
        return;
      }
      if (!this.fileTemplateTabs.some((item) => item.id === tab.id)) {
        this.fileTemplateTabs = normalizeFileTemplateTabs([...this.fileTemplateTabs, tab]);
        this.tabOrder = normalizeTabOrder([...this.tabOrder, getCustomTabId(tab.id)], this.fileTemplateTabs);
        await this.saveFileTemplateTabs(this.fileTemplateTabs);
        await this.persistTabPreferences();
      }
      await this.openFileTemplateTab(tab.id);
    });
  }

  private openFileTemplateTabMenu(event: MouseEvent, tab: FileTemplateTab): void {
    event.preventDefault();
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(t(this.options.language, "projectSend.renameTagTab"))
        .setIcon("pencil")
        .onClick(() => void this.renameFileTemplateTab(tab));
    });
    menu.addItem((item) => {
      item.setTitle(t(this.options.language, "projectSend.removeTagTab"))
        .setIcon("x")
        .onClick(() => void this.removeFileTemplateTab(tab.id));
    });
    menu.showAtMouseEvent(event);
  }

  private renameFileTemplateTab(tab: FileTemplateTab): Promise<void> {
    return promptForProjectTemplateTab(
      this.app,
      this.options.language,
      async (value) => {
        const name = value.trim();
        if (!name || name === tab.name) {
          return;
        }
        this.fileTemplateTabs = normalizeFileTemplateTabs(this.fileTemplateTabs.map((item) => (item.id === tab.id ? { ...item, name } : item)));
        await this.saveFileTemplateTabs(this.fileTemplateTabs);
        if (this.mode === "custom-tag" && this.activeFileTemplateTabId === tab.id) {
          await this.openFileTemplateTab(tab.id);
          return;
        }
        this.renderCurrentMode();
      },
      tab.name,
      "projectSend.renameTagTab",
      "projectSend.renameTagTab"
    );
  }

  private async removeFileTemplateTab(tabId: string): Promise<void> {
    const id = getCustomTabId(tabId);
    this.fileTemplateTabs = this.fileTemplateTabs.filter((item) => item.id !== tabId);
    this.tabOrder = normalizeTabOrder(this.tabOrder.filter((item) => item !== id), this.fileTemplateTabs);
    this.hiddenTabs = normalizeHiddenTabs(this.hiddenTabs.filter((item) => item !== id), this.fileTemplateTabs);
    await this.saveFileTemplateTabs(this.fileTemplateTabs);
    await this.persistTabPreferences();
    if (this.mode === "custom-tag" && this.activeFileTemplateTabId === tabId) {
      this.mode = "search";
      this.activeFileTemplateTabId = "";
      void this.renderFileSearch();
      return;
    }
    this.renderCurrentMode();
  }

  private async saveFileTemplateTabs(tabs: FileTemplateTab[]): Promise<void> {
    this.fileTemplateTabs = normalizeFileTemplateTabs(tabs);
    this.tabOrder = normalizeTabOrder(this.tabOrder, this.fileTemplateTabs);
    this.hiddenTabs = normalizeHiddenTabs(this.hiddenTabs, this.fileTemplateTabs);
    await this.options.onSaveFileTemplateTabs([...this.fileTemplateTabs]);
    await this.options.onSaveCustomTagTabs?.(projectSendTagTabsFromFileTemplateTabs(this.fileTemplateTabs));
  }
}

function canReorderTemplateTabs(settings: FileTemplateTabInteractionSettings): boolean {
  if (Platform.isMobile) {
    return !settings.mobileReadOnly && settings.enableMobileReorder;
  }
  return settings.enableDesktopDrag;
}

function isMobileTemplateTabsReadOnly(settings: FileTemplateTabInteractionSettings): boolean {
  return Platform.isMobile && settings.mobileReadOnly;
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const normalized = tag.trim().replace(/^#+/, "");
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
}

function normalizeTabOrder(value: string[], customTabs: FileTemplateTab[]): string[] {
  const validIds = getTabIds(customTabs);
  const seen = new Set<string>();
  const order = value.flatMap((item) => {
    const id = item.trim();
    if (!validIds.includes(id) || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [id];
  });
  for (const id of validIds) {
    if (!seen.has(id)) {
      order.push(id);
    }
  }
  return order;
}

function normalizeHiddenTabs(value: string[], customTabs: FileTemplateTab[]): string[] {
  const validIds = getTabIds(customTabs);
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const id = item.trim();
    if (!validIds.includes(id) || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [id];
  });
}

function getTabIds(customTabs: FileTemplateTab[]): string[] {
  return [...FIXED_SEND_TABS, ...customTabs.map((tab) => getCustomTabId(tab.id))];
}

function getCustomTabId(tabId: string): string {
  return `${CUSTOM_TAB_PREFIX}${tabId}`;
}

function getCustomTabFromTabId(id: string, tabs: FileTemplateTab[]): FileTemplateTab | null {
  if (!id.startsWith(CUSTOM_TAB_PREFIX)) {
    return null;
  }
  const tabId = id.slice(CUSTOM_TAB_PREFIX.length).trim();
  return tabs.find((tab) => tab.id === tabId) ?? null;
}

function projectSendTagTabsFromFileTemplateTabs(tabs: FileTemplateTab[]): string[] {
  return uniqueTags(tabs.flatMap((tab) => (tab.type === "tag-filter" ? tab.tags : [])));
}

function createdFileToTaggedFileInfo(file: TFile, tag = ""): TaggedFileInfo {
  const normalizedTag = normalizeFileTag(tag);
  const tags = normalizedTag ? [normalizedTag] : [];
  return {
    file,
    name: file.basename,
    path: file.path,
    tags,
    matchTags: tags,
    updatedAt: file.stat?.mtime ?? Date.now()
  };
}

function isFixedSendMode(id: string): id is SendMode {
  return (FIXED_SEND_TABS as readonly string[]).includes(id);
}

function createField(container: HTMLElement, labelText: string): HTMLElement {
  const field = container.createDiv({ cls: "memos-plus-task-option-field" });
  field.createEl("label", { text: labelText });
  return field;
}

function createTextField(container: HTMLElement, labelText: string, placeholder: string): HTMLInputElement {
  const field = createField(container, labelText);
  return field.createEl("input", { attr: { type: "text", placeholder } });
}

function createSelectField(container: HTMLElement, labelText: string, options: Array<[string, string]>): HTMLSelectElement {
  const field = createField(container, labelText);
  const select = field.createEl("select");
  for (const [value, text] of options) {
    select.createEl("option", { value, text });
  }
  return select;
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

function formatUpdatedAt(value: number, language: Language): string {
  if (!value) {
    return language === "en" ? "unknown update time" : "未知更新时间";
  }
  const date = new Date(value);
  const today = startOfDay(new Date()).getTime();
  const target = startOfDay(date).getTime();
  const dayDiff = Math.round((today - target) / 86400000);
  if (dayDiff === 0) {
    return language === "en" ? "updated today" : "今天更新";
  }
  if (dayDiff === 1) {
    return language === "en" ? "updated yesterday" : "昨天更新";
  }
  const stamp = [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  return language === "en" ? `updated ${stamp}` : `${stamp} 更新`;
}

function compactFilePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  if (parts.length === 0) {
    return "";
  }
  const folder = parts.join("/");
  if (folder.length <= 36) {
    return folder;
  }
  return `…/${parts.slice(-2).join("/")}`;
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

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
