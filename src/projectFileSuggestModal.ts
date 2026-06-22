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
import { filterFileTemplateLibraryItems, type FileTemplateLibraryItem } from "./fileTemplateLibrary";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { focusOnDesktopOnly } from "./modalFocus";
import { mobileModalResultLimit, registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";
import { debounce } from "./performance";
import type { ProjectInfo } from "./projectSend";
import { resolveTemplateTaskDecision, type ManagedTemplate, type TemplateTaskDecision } from "./templateManager";
import { normalizeTaskDate, normalizeTaskPriority, normalizeTaskRecurrence, type ProjectTaskOptions, type TaskContentMode, type TaskPriority, type TaskRecurrence } from "./tasksFormat";

type SendMode = "project" | "tag" | "recent" | "search" | "custom-tag";
type FixedSendMode = Exclude<SendMode, "custom-tag">;

const FIXED_SEND_TABS: FixedSendMode[] = ["project", "tag", "recent", "search"];
const CUSTOM_TAB_PREFIX = "custom:";

export interface ProjectSendChoice {
  file: TFile;
  section: string;
  task?: ProjectTaskOptions;
  mode?: "project" | "file";
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

interface ProjectSendModalOptions {
  language: Language;
  content: string;
  defaultHeading: string;
  initialMode?: SendMode;
  taskSettings: ProjectSendTaskSettings;
  enableFileTargets: boolean;
  commonFileTags: string[];
  customTagTabs: string[];
  tabOrder: string[];
  hiddenTabs: string[];
  templates: ManagedTemplate[];
  initialTemplateId?: string;
  preferredFileTemplatePath?: string;
  defaultFileTag: string;
  defaultFileInsertPosition: FileInsertPosition;
  noHeadingBehavior: NoHeadingBehavior;
  onLoadProjects: () => Promise<ProjectInfo[]>;
  onLoadRecentFiles: () => Promise<TaggedFileInfo[]>;
  onCreateProject: (name: string) => Promise<ProjectInfo | null>;
  onLoadFileTemplates: () => Promise<FileTemplateLibraryItem[]>;
  onCreateFromFileTemplate: (templatePath: string, title: string, tag?: string) => Promise<TFile | null>;
  onToggleFileTemplateFavorite: (templatePath: string) => Promise<void>;
  onDeleteFileTemplate: (templatePath: string) => Promise<void>;
  onMarkFileTemplateRecent: (templatePath: string) => Promise<void>;
  getPreferredFileTemplatePath?: (tag: string) => string;
  onLoadTags: () => Promise<string[]>;
  onLoadTaggedFiles: (tagQuery: string) => Promise<TaggedFileInfo[]>;
  onSearchFiles: (query: string) => Promise<TaggedFileInfo[]>;
  onLoadHeadings: (file: TFile) => Promise<FileHeadingInfo[]>;
  onSaveCustomTagTabs: (tags: string[]) => Promise<void>;
  onSaveTabPreferences: (state: { tabOrder: string[]; hiddenTabs: string[] }) => Promise<void>;
  onSaveDefault?: () => Promise<void>;
  onChoose: (choice: ProjectSendChoice | null) => void;
}

class ProjectTagTabModal extends Modal {
  private input!: HTMLInputElement;

  constructor(
    app: App,
    private readonly language: Language,
    private readonly onSubmit: (value: string) => Promise<void>,
    private readonly initialValue = "",
    private readonly titleKey = "projectSend.addTagTab",
    private readonly submitKey = "projectSend.addTagTab"
  ) {
    super(app);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "ProjectTagTabModal");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal");
    contentEl.createEl("h2", { text: t(this.language, this.titleKey) });
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
    registerMemosPlusModalClose(this, "ProjectTagTabModal");
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

function promptForProjectTagTab(
  app: App,
  language: Language,
  onSubmit: (value: string) => Promise<void>,
  initialValue = "",
  titleKey = "projectSend.addTagTab",
  submitKey = "projectSend.addTagTab"
): Promise<void> {
  if (Platform.isMobile) {
    const value = window.prompt(t(language, titleKey), initialValue)?.trim() ?? "";
    return value ? onSubmit(value) : Promise.resolve();
  }
  new ProjectTagTabModal(app, language, onSubmit, initialValue, titleKey, submitKey).open();
  return Promise.resolve();
}

class FileTemplateLibraryModal extends Modal {
  private items: FileTemplateLibraryItem[] = [];
  private selectedPath = "";
  private query = "";
  private activeCategory = "全部";
  private titleInput!: HTMLInputElement;
  private listEl!: HTMLElement;
  private closed = false;

  constructor(
    app: App,
    private readonly options: {
      language: Language;
      initialTitle: string;
      initialTag?: string;
      preferredPath?: string;
      onLoad: () => Promise<FileTemplateLibraryItem[]>;
      onCreate: (template: FileTemplateLibraryItem, title: string) => Promise<void>;
      onToggleFavorite: (templatePath: string) => Promise<void>;
      onDelete: (templatePath: string) => Promise<void>;
    }
  ) {
    super(app);
    this.selectedPath = options.preferredPath ?? "";
    this.query = options.initialTag ?? "";
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
    this.items = [];
    this.contentEl.empty();
  }

  private async load(): Promise<void> {
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
      if (contentEl.isConnected) {
        contentEl.empty();
        contentEl.addClass("memos-plus-modal", "memos-plus-file-template-modal");
        contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileTemplateLibrary.empty") });
      }
      return;
    }
    if (this.closed) {
      return;
    }
    if (!this.items.some((item) => item.path === this.selectedPath)) {
      this.selectedPath = this.items.find((item) => item.isFavorite)?.path ?? this.items[0]?.path ?? "";
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

    const search = contentEl.createEl("input", {
      cls: "memos-plus-project-search",
      attr: { type: "search", placeholder: t(lang, "fileTemplateLibrary.searchPlaceholder") }
    });
    search.value = this.query;
    const renderDebounced = debounce(() => {
      this.renderList();
    }, 200);
    search.addEventListener("input", () => {
      this.query = search.value;
      renderDebounced();
    });

    this.renderCategoryTabs(contentEl);
    this.titleInput = createTextField(contentEl, t(lang, "fileTemplateLibrary.fileName"), t(lang, "projectSend.projectNamePlaceholder"));
    this.titleInput.value = this.options.initialTitle;
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
    focusOnDesktopOnly(this.titleInput);
  }

  private renderCategoryTabs(container: HTMLElement): void {
    const lang = this.options.language;
    const tabs = container.createDiv({ cls: "memos-plus-file-template-tabs" });
    const categories = ["全部", "收藏", "最近", ...uniqueTags(this.items.map((item) => item.category))];
    for (const category of categories) {
      const button = tabs.createEl("button", {
        cls: `memos-plus-file-template-tab${category === this.activeCategory ? " is-active" : ""}`,
        attr: { type: "button", "aria-pressed": String(category === this.activeCategory) },
        text: category === "全部" ? t(lang, "fileTemplateLibrary.category.all") : category === "收藏" ? t(lang, "fileTemplateLibrary.category.favorite") : category === "最近" ? t(lang, "fileTemplateLibrary.category.recent") : category
      });
      button.addEventListener("click", () => {
        this.activeCategory = category;
        this.render();
      });
    }
    const add = tabs.createEl("button", {
      cls: "memos-plus-file-template-tab memos-plus-file-template-tab-add",
      attr: { type: "button", title: t(lang, "fileTemplateLibrary.category.custom") }
    });
    setIcon(add, "plus");
    add.addEventListener("click", () => {
      void withMobileClickLock(add, () => promptForProjectTagTab(
        this.app,
        lang,
        async (value) => {
          const category = value.trim();
          if (category) {
            this.activeCategory = category;
            this.render();
          }
        },
        "",
        "fileTemplateLibrary.category.custom",
        "projectSend.addTagTab"
      ));
    });
  }

  private renderList(): void {
    if (this.closed) {
      return;
    }
    const lang = this.options.language;
    this.listEl.empty();
    const items = filterFileTemplateLibraryItems(this.items, { query: this.query, category: this.activeCategory }).slice(0, mobileModalResultLimit());
    if (items.length === 0) {
      this.listEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileTemplateLibrary.empty") });
      return;
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
      const favorite = actions.createEl("button", {
        cls: "memos-plus-icon-button",
        attr: { type: "button", title: t(lang, "fileTemplateLibrary.favorite") }
      });
      setIcon(favorite, item.isFavorite ? "star" : "star-off");
      favorite.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void withMobileClickLock(favorite, () => this.toggleFavorite(item.path));
      });
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

  private async toggleFavorite(path: string): Promise<void> {
    try {
      await this.options.onToggleFavorite(path);
      this.items = await this.options.onLoad();
      this.renderList();
    } catch (error) {
      console.error("[Memos Plus] Failed to toggle file template favorite", error);
    }
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
    if (!window.confirm(t(this.options.language, "fileTemplateLibrary.deleteConfirm"))) {
      return;
    }
    try {
      await this.options.onDelete(item.path);
      this.items = await this.options.onLoad();
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
    if (!title) {
      focusOnDesktopOnly(this.titleInput);
      return;
    }
    const template = this.items.find((item) => item.path === this.selectedPath) ?? this.items[0];
    if (!template) {
      return;
    }
    button.disabled = true;
    try {
      await this.options.onCreate(template, title);
      this.close();
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
  private query = "";
  private tagQuery = "";
  private fileQuery = "";
  private tagOptions: string[] = [];
  private customTagTabs: string[] = [];
  private tabOrder: string[] = [];
  private hiddenTabs: string[] = [];
  private activeCustomTag = "";
  private currentTemplateId = "";
  private tagsLoaded = false;
  private tagsLoading = false;
  private projects: ProjectInfo[] = [];
  private projectsLoaded = false;
  private projectsLoading = false;
  private recentFiles: TaggedFileInfo[] = [];
  private recentFilesLoaded = false;
  private recentFilesLoading = false;
  private readonly taggedFilesCache = new Map<string, TaggedFileInfo[]>();
  private readonly fileSearchCache = new Map<string, TaggedFileInfo[]>();
  private readonly fileHeadingsCache = new Map<string, FileHeadingInfo[]>();
  private draggedTabId = "";
  private closed = false;

  constructor(app: App, private readonly options: ProjectSendModalOptions) {
    super(app);
    this.mode = options.initialMode ?? "project";
    this.currentTemplateId = options.initialTemplateId ?? options.templates[0]?.id ?? "";
    this.tagQuery = options.defaultFileTag;
    this.customTagTabs = uniqueTags(options.customTagTabs);
    this.tabOrder = normalizeTabOrder(options.tabOrder, this.customTagTabs);
    this.hiddenTabs = normalizeHiddenTabs(options.hiddenTabs, this.customTagTabs);
    this.applyCurrentTemplateDefaults();
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
    this.projects = [];
    this.recentFiles = [];
    this.tagOptions = [];
    this.taggedFilesCache.clear();
    this.fileSearchCache.clear();
    this.fileHeadingsCache.clear();
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.options.onChoose(null);
    }
  }

  private async ensureTagsLoaded(): Promise<void> {
    if (this.tagsLoaded || this.tagsLoading) {
      return;
    }
    this.tagsLoading = true;
    try {
      this.tagOptions = await this.options.onLoadTags();
      this.tagsLoaded = true;
    } catch (error) {
      console.error("[Memos Plus] Failed to load tags", error);
    } finally {
      this.tagsLoading = false;
    }
    if (!this.closed && this.mode === "tag") {
      this.renderTagPicker();
    }
  }

  private async ensureProjectsLoaded(list?: HTMLElement): Promise<void> {
    if (this.projectsLoaded || this.projectsLoading) {
      return;
    }
    this.projectsLoading = true;
    try {
      this.projects = await this.options.onLoadProjects();
      this.projectsLoaded = true;
    } catch (error) {
      console.error("[Memos Plus] Failed to load projects", error);
    } finally {
      this.projectsLoading = false;
    }
    if (!this.closed && this.mode === "project" && list?.isConnected) {
      this.renderProjectListContent(list);
    }
  }

  private async ensureRecentFilesLoaded(): Promise<void> {
    if (this.recentFilesLoaded || this.recentFilesLoading) {
      return;
    }
    this.recentFilesLoading = true;
    try {
      this.recentFiles = await this.options.onLoadRecentFiles();
      this.recentFilesLoaded = true;
    } catch (error) {
      console.error("[Memos Plus] Failed to load recent files", error);
    } finally {
      this.recentFilesLoading = false;
    }
    if (!this.closed && this.mode === "recent") {
      this.renderRecentFiles();
    }
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
    const template = this.currentTemplate();
    if (template?.targetSource === "default-memo") {
      this.renderDefaultMemoTemplate();
      return;
    }
    if (template?.targetSource === "fixed-file") {
      void this.renderFixedFileTemplate(template);
      return;
    }
    if (this.mode === "custom-tag" && this.activeCustomTag) {
      void this.renderCustomTagFiles(this.activeCustomTag);
      return;
    }
    if (this.mode === "tag") {
      void this.ensureTagsLoaded();
      this.renderTagPicker();
      return;
    }
    if (this.mode === "recent") {
      this.renderRecentFiles();
      return;
    }
    if (this.mode === "search") {
      void this.renderFileSearch();
      return;
    }
    this.renderProjectList();
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

  private async renderFixedFileTemplate(template: ManagedTemplate): Promise<void> {
    const contentEl = this.renderShell();
    const file = this.app.vault.getAbstractFileByPath(template.fixedFilePath);
    if (!(file instanceof TFile)) {
      contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(this.options.language, "fileSend.noFiles") });
      return;
    }
    await this.renderHeadingPicker(
      {
        file,
        name: file.basename,
        path: file.path,
        tags: template.defaultTags,
        matchTags: template.defaultTags,
        updatedAt: file.stat?.mtime ?? Date.now()
      },
      () => void this.renderFixedFileTemplate(template)
    );
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

  private applyCurrentTemplateDefaults(): void {
    const template = this.currentTemplate();
    if (!template) {
      return;
    }
    if (template.targetSource === "project-tag") {
      this.mode = "project";
      this.activeCustomTag = "";
      return;
    }
    if (template.targetSource === "specific-tag") {
      const tag = template.recognitionTag || template.defaultTags[0] || "";
      if (tag) {
        this.mode = "custom-tag";
        this.activeCustomTag = tag;
        this.tagQuery = tag;
        return;
      }
      this.mode = "tag";
      return;
    }
    if (template.targetSource === "recent-file") {
      this.mode = "recent";
      this.activeCustomTag = "";
      return;
    }
    if (template.targetSource === "vault-search" || template.targetSource === "fixed-file" || template.targetSource === "new-file") {
      this.mode = "search";
      this.activeCustomTag = "";
      return;
    }
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
          "aria-pressed": String(isActive),
          draggable: "true"
        }
      });
      button.createSpan({ cls: "memos-plus-project-send-tab-label", text: this.tabLabel(id) });
      const customTag = getCustomTagFromTabId(id);
      if (customTag) {
        button.setAttr("title", t(lang, "projectSend.removeTagTabHint"));
        const close = button.createSpan({ cls: "memos-plus-project-send-tab-close", attr: { "aria-label": t(lang, "projectSend.removeTagTab") } });
        setIcon(close, "x");
      close.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void withMobileClickLock(close, () => this.removeCustomTagTab(customTag));
      });
      button.addEventListener("contextmenu", (event) => this.openCustomTagTabMenu(event, customTag));
    }
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.openTab(id)));
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
    if (this.options.enableFileTargets) {
      const add = tabs.createEl("button", {
        cls: "memos-plus-project-send-tab memos-plus-project-send-tab-add",
        attr: { type: "button", "aria-label": t(lang, "projectSend.addTagTab"), title: t(lang, "projectSend.addTagTab") }
      });
      setIcon(add, "plus");
      add.addEventListener("click", () => void withMobileClickLock(add, () => this.addCustomTagTab()));
    }
  }

  private visibleTabIds(): string[] {
    const hidden = new Set(this.hiddenTabs);
    const ids = normalizeTabOrder(this.tabOrder, this.customTagTabs).filter((id) => !hidden.has(id));
    const available = ids.filter((id) => id === "project" || this.options.enableFileTargets || getCustomTagFromTabId(id));
    return available.length > 0 ? available : ["project"];
  }

  private activeTabId(): string {
    if (this.mode === "custom-tag" && this.activeCustomTag) {
      return getCustomTabId(this.activeCustomTag);
    }
    return this.mode;
  }

  private tabLabel(id: string): string {
    const customTag = getCustomTagFromTabId(id);
    if (customTag) {
      return customTag;
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
    const fallback = visible[0] ?? "project";
    const customTag = getCustomTagFromTabId(fallback);
    if (customTag) {
      this.mode = "custom-tag";
      this.activeCustomTag = customTag;
      return;
    }
    this.mode = isFixedSendMode(fallback) ? fallback : "project";
    this.activeCustomTag = "";
  }

  private async openTab(id: string): Promise<void> {
    const customTag = getCustomTagFromTabId(id);
    if (customTag) {
      await this.openCustomTagTab(customTag);
      return;
    }
    if (!isFixedSendMode(id)) {
      return;
    }
    this.mode = id;
    this.activeCustomTag = "";
    if (id === "project") {
      this.renderProjectList();
    } else if (id === "tag") {
      void this.ensureTagsLoaded();
      this.renderTagPicker();
    } else if (id === "recent") {
      this.renderRecentFiles();
    } else {
      void this.renderFileSearch();
    }
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
    const order = normalizeTabOrder(this.tabOrder, this.customTagTabs);
    const from = order.indexOf(sourceId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) {
      return;
    }
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    this.tabOrder = normalizeTabOrder(next, this.customTagTabs);
    await this.persistTabPreferences();
    this.renderCurrentMode();
  }

  private async persistTabPreferences(): Promise<void> {
    this.tabOrder = normalizeTabOrder(this.tabOrder, this.customTagTabs);
    this.hiddenTabs = normalizeHiddenTabs(this.hiddenTabs, this.customTagTabs);
    await this.options.onSaveTabPreferences({ tabOrder: [...this.tabOrder], hiddenTabs: [...this.hiddenTabs] });
  }

  private renderProjectList(): void {
    const lang = this.options.language;
    const contentEl = this.renderShell();

    const search = contentEl.createEl("input", {
      cls: "memos-plus-project-search",
      attr: { type: "search", placeholder: t(lang, "projectSend.searchPlaceholder") }
    });
    search.value = this.query;
    const list = contentEl.createDiv({ cls: "memos-plus-project-list" });
    const renderDebounced = debounce(() => this.renderProjectListContent(list), 200);
    search.addEventListener("input", () => {
      this.query = search.value;
      renderDebounced();
    });

    this.renderProjectListContent(list);
    void this.ensureProjectsLoaded(list);

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    if (this.options.onSaveDefault) {
      this.renderDirectSendButton(footer);
    }
    const add = footer.createEl("button", { cls: "memos-plus-project-add", attr: { type: "button" } });
    setIcon(add, "folder-plus");
    add.createSpan({ text: t(lang, "projectSend.addProject") });
    add.addEventListener("click", () => this.openFileTemplateLibraryModal("project"));
  }

  private renderProjectListContent(list: HTMLElement): void {
    const lang = this.options.language;
    list.empty();
    if (this.projectsLoading || !this.projectsLoaded) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
      return;
    }
    const projects = this.filteredProjects();
    if (projects.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "projectSend.noProjects") });
      this.renderTemplateCreateButton(list, "project");
    }
    for (const project of projects) {
      const button = this.renderProjectOption(list, project);
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.renderProjectHeadingPicker(project)));
    }
  }

  private renderTagPicker(): void {
    const lang = this.options.language;
    const contentEl = this.renderShell();
    const search = contentEl.createEl("input", {
      cls: "memos-plus-project-search",
      attr: { type: "search", placeholder: t(lang, "fileSend.searchTags") }
    });
    search.value = this.tagQuery;
    const list = contentEl.createDiv({ cls: "memos-plus-project-list memos-plus-tag-target-list" });
    const renderDebounced = debounce(() => this.renderTagPickerContent(list), 200);
    search.addEventListener("input", () => {
      this.tagQuery = search.value;
      renderDebounced();
    });

    this.renderTagPickerContent(list);
  }

  private renderTagPickerContent(list: HTMLElement): void {
    const lang = this.options.language;
    list.empty();
    if (this.tagsLoading) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
      return;
    }

    const normalizedQuery = this.tagQuery.trim().replace(/^#+/, "").toLowerCase();
    const commonTags = this.options.commonFileTags.filter((tag) => !normalizedQuery || tag.toLowerCase().includes(normalizedQuery));
    const vaultTags = this.tagOptions.filter((tag) => !normalizedQuery || tag.toLowerCase().includes(normalizedQuery));
    const tags = uniqueTags([...commonTags, ...vaultTags]).slice(0, 80);

    if (tags.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "savedSearch.noTagOptions") });
      const createTag = normalizeFileTag(this.tagQuery);
      if (createTag) {
        this.renderTemplateCreateButton(list, "file", createTag);
      }
    }
    if (commonTags.length > 0) {
      list.createDiv({ cls: "memos-plus-file-target-label", text: t(lang, "fileSend.commonTags") });
    }
    for (const tag of tags) {
      const button = list.createEl("button", { cls: "memos-plus-project-option", attr: { type: "button" } });
      const title = button.createDiv({ cls: "memos-plus-project-option-title" });
      setIcon(title.createSpan({ cls: "memos-plus-file-target-icon" }), "tag");
      title.createSpan({ text: tag });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.renderTaggedFiles(tag)));
    }
  }

  private async renderTaggedFiles(tag: string): Promise<void> {
    const lang = this.options.language;
    this.tagQuery = tag;
    const contentEl = this.renderFileStepHeader(t(lang, "fileSend.selectFile"), () => this.renderTagPicker());
    contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileSend.selectFile") });
    let files: TaggedFileInfo[] = [];
    try {
      files = await this.loadTaggedFilesCached(tag);
    } catch (error) {
      console.error("[Memos Plus] Failed to load tagged files", error);
    }
    if (this.closed) {
      return;
    }
    this.renderFileList(files, `${t(lang, "fileSend.selectFile")} · #${tag}`, () => void this.renderTaggedFiles(tag), () => this.renderTagPicker(), tag);
  }

  private async renderCustomTagFiles(tag: string): Promise<void> {
    const lang = this.options.language;
    this.mode = "custom-tag";
    this.activeCustomTag = tag;
    this.tagQuery = tag;
    const title = `${t(lang, "fileSend.selectFile")} · #${tag}`;
    this.renderShell().createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
    let files: TaggedFileInfo[] = [];
    try {
      files = await this.loadTaggedFilesCached(tag);
    } catch (error) {
      console.error("[Memos Plus] Failed to load custom tag files", error);
    }
    if (this.mode !== "custom-tag" || this.activeCustomTag !== tag) {
      return;
    }
    this.renderFileList(files, title, () => void this.renderCustomTagFiles(tag), undefined, tag);
  }

  private renderRecentFiles(): void {
    const lang = this.options.language;
    if (this.recentFilesLoading || !this.recentFilesLoaded) {
      const contentEl = this.renderShell();
      contentEl.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "common.loading") });
      void this.ensureRecentFilesLoaded();
      return;
    }
    this.renderFileList(this.recentFiles, t(lang, "fileSend.mode.recent"), () => this.renderRecentFiles());
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
    }, 200);
    search.addEventListener("input", () => {
      this.fileQuery = search.value;
      this.updateFileSearchCreateButton(createFile);
      renderDebounced();
    });
    void this.renderFileSearchContent(list);
  }

  private async renderFileSearchContent(list: HTMLElement): Promise<void> {
    const query = this.fileQuery;
    list.empty();
    const cached = this.fileSearchCache.get(query.trim().toLowerCase());
    if (cached) {
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
    if (query !== this.fileQuery) {
      return;
    }
    list.empty();
    this.renderFileListItems(list, files, () => void this.renderFileSearch(), undefined, "", false);
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
        this.renderTemplateCreateButton(list, "file", createTag);
      }
    }
    for (const info of files.slice(0, mobileModalResultLimit())) {
      const button = this.renderFileInfoOption(list, info);
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.renderHeadingPicker(info, refresh, back)));
    }
  }

  private renderProjectOption(container: HTMLElement, project: ProjectInfo): HTMLButtonElement {
    return this.renderSendListOption(container, {
      title: project.name,
      icon: "folder",
      metaParts: this.projectMetaParts(project),
      titleAttr: project.file.path
    });
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

  private projectMetaParts(project: ProjectInfo): string[] {
    return [project.isRecent ? t(this.options.language, "projectSend.recent") : "", project.status, formatUpdatedAt(project.updatedAt, this.options.language)];
  }

  private fileMetaParts(info: TaggedFileInfo): string[] {
    const tags = (info.matchTags.length > 0 ? info.matchTags : info.tags).slice(0, 4).map((tag) => `#${tag}`).join(" · ");
    return [this.isRecentFile(info) ? t(this.options.language, "projectSend.recent") : "", info.status ?? "", tags, formatUpdatedAt(info.updatedAt, this.options.language)];
  }

  private isRecentFile(info: TaggedFileInfo): boolean {
    return this.recentFiles.some((recent) => recent.path === info.path);
  }

  private async renderHeadingPicker(info: TaggedFileInfo, refresh: () => void, back?: () => void, mode: "file" | "project" = "file"): Promise<void> {
    const lang = this.options.language;
    const contentEl = this.renderFileStepHeader(info.name, back ?? refresh);
    contentEl.createDiv({ cls: "memos-plus-project-section-hint", text: mode === "project" ? t(lang, "projectSend.chooseSection") : info.path });

    const position = createSelectField(contentEl, t(lang, "fileSend.selectPosition"), [
      ["heading-top", t(lang, "fileSend.position.headingTop")],
      ["heading-bottom", t(lang, "fileSend.position.headingBottom")],
      ["new-heading", t(lang, "fileSend.position.newHeading")],
      ["file-end", t(lang, "fileSend.position.fileEnd")],
      ["file-start", t(lang, "fileSend.position.fileStart")]
    ]);
    position.value = this.currentTemplate()?.insertPosition ?? this.options.defaultFileInsertPosition;
    const newHeadingControls = contentEl.createDiv({ cls: "memos-plus-new-heading-options" });
    const newHeadingName = createTextField(newHeadingControls, t(lang, "fileSend.newHeadingName"), this.defaultInsertHeading());
    newHeadingName.value = this.currentTemplate()?.newHeadingName || this.defaultInsertHeading();
    const newHeadingLevel = createSelectField(
      newHeadingControls,
      t(lang, "fileSend.newHeadingLevel"),
      [1, 2, 3, 4, 5, 6].map((level) => [String(level), t(lang, `fileSend.headingLevel.${level}`)])
    );
    newHeadingLevel.value = String(this.currentTemplate()?.newHeadingLevel ?? 2);
    const newHeadingPosition = createSelectField(newHeadingControls, t(lang, "fileSend.newHeadingPosition"), [
      ["file-end", t(lang, "fileSend.newHeadingPosition.file-end")],
      ["file-start", t(lang, "fileSend.newHeadingPosition.file-start")],
      ["after-current-heading", t(lang, "fileSend.newHeadingPosition.after-current-heading")]
    ]);
    newHeadingPosition.value = this.currentTemplate()?.newHeadingPosition ?? "file-end";
    const existingHeadingBehavior = createSelectField(newHeadingControls, t(lang, "fileSend.existingHeadingBehavior"), [
      ["use-existing", t(lang, "fileSend.existingHeadingBehavior.use-existing")],
      ["create-duplicate", t(lang, "fileSend.existingHeadingBehavior.create-duplicate")],
      ["cancel", t(lang, "fileSend.existingHeadingBehavior.cancel")]
    ]);
    existingHeadingBehavior.value = this.currentTemplate()?.existingHeadingBehavior ?? "use-existing";
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
        this.handleFileTargetChoice(info.file, "", "new-heading", () => void this.renderHeadingPicker(info, refresh, back, mode), mode, false, buildNewHeadingTarget(""))
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
    if (this.closed) {
      return;
    }
    const list = contentEl.createDiv({ cls: "memos-plus-project-section-grid memos-plus-heading-target-grid" });
    if (headings.length === 0) {
      list.createDiv({ cls: "memos-plus-project-empty", text: t(lang, "fileSend.noHeadings") });
      if (position.value !== "new-heading" && mode !== "project" && (this.options.noHeadingBehavior === "file-start" || this.options.noHeadingBehavior === "file-end")) {
        this.handleFileTargetChoice(info.file, "", this.options.noHeadingBehavior, () => void this.renderHeadingPicker(info, refresh, back, mode), mode);
        return;
      }
      this.renderFilePositionButtons(list, info.file, () => void this.renderHeadingPicker(info, refresh, back, mode), mode, true);
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
            () => void this.renderHeadingPicker(info, refresh, back, mode),
            mode,
            false,
            selectedPosition === "new-heading" ? buildNewHeadingTarget(heading.heading) : {}
          );
        })
      );
    }

    this.renderFilePositionButtons(list, info.file, () => void this.renderHeadingPicker(info, refresh, back, mode), mode);
  }

  private renderFilePositionButtons(container: HTMLElement, file: TFile, backAction?: () => void, mode: "file" | "project" = "file", includeCreateHeading = false): void {
    const lang = this.options.language;
    for (const [position, label] of [
      ["file-end", t(lang, "fileSend.position.fileEnd")],
      ["file-start", t(lang, "fileSend.position.fileStart")]
    ] as Array<[FileInsertPosition, string]>) {
      const button = container.createEl("button", { cls: "memos-plus-project-section", attr: { type: "button" }, text: label });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.handleFileTargetChoice(file, "", position, backAction, mode)));
    }
    if (includeCreateHeading) {
      const heading = this.defaultInsertHeading();
      const button = container.createEl("button", { cls: "memos-plus-project-section is-default", attr: { type: "button" }, text: `${t(lang, "fileSend.position.createHeading")}：${heading}` });
      button.addEventListener("click", () => void withMobileClickLock(button, () => this.handleFileTargetChoice(file, heading, "heading-top", backAction, mode, true)));
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

  private async renderProjectHeadingPicker(project: ProjectInfo): Promise<void> {
    await this.renderHeadingPicker(projectInfoToTaggedFileInfo(project), () => void this.renderProjectHeadingPicker(project), () => this.renderProjectList(), "project");
  }

  private defaultInsertHeading(): string {
    return this.currentTemplate()?.heading?.trim() || this.options.defaultHeading.trim() || "收集箱";
  }

  private handleFileTargetChoice(
    file: TFile,
    heading: string,
    position: FileInsertPosition,
    backAction?: () => void,
    mode: "file" | "project" = "file",
    createHeadingIfMissing = false,
    targetOptions: Partial<FileSendTarget> = {}
  ): void {
    const taskHeading = position === "new-heading" ? targetOptions.newHeadingName ?? heading : heading;
    const decision = this.taskDecisionFor(taskHeading);
    if (decision === "ask" || (decision === "task" && this.options.taskSettings.promptOnCreate)) {
      this.renderTaskOptions(
        `${file.basename} · ${taskHeading || t(this.options.language, `fileSend.position.${position === "file-start" ? "fileStart" : position === "new-heading" ? "newHeading" : "fileEnd"}`)}`,
        backAction ?? (() => this.renderCurrentMode()),
        (task) =>
          mode === "project"
            ? this.chooseProjectFileTarget(file, heading, position, this.currentTemplate(), task, createHeadingIfMissing, targetOptions)
            : this.chooseFile(file, heading, position, this.currentTemplate(), task, createHeadingIfMissing, targetOptions),
        true,
        this.taskContentModeForCurrentTemplate()
      );
      return;
    }
    const task = decision === "task" ? this.defaultTaskOptions() : undefined;
    if (mode === "project") {
      this.chooseProjectFileTarget(file, heading, position, this.currentTemplate(), task, createHeadingIfMissing, targetOptions);
      return;
    }
    this.chooseFile(file, heading, position, this.currentTemplate(), task, createHeadingIfMissing, targetOptions);
  }

  private taskDecisionFor(heading: string): TemplateTaskDecision {
    return resolveTemplateTaskDecision(this.currentTemplate(), {
      content: this.options.content,
      heading
    });
  }

  private defaultTaskOptions(): ProjectTaskOptions {
    return {
      isTask: true,
      priority: this.options.taskSettings.defaultPriority,
      scheduledDate: this.options.taskSettings.defaultScheduledDate,
      dueDate: this.options.taskSettings.defaultDueDate,
      recurrence: this.options.taskSettings.defaultRecurrence,
      addCreatedDate: this.options.taskSettings.addCreatedDate,
      contentMode: this.defaultTaskContentMode()
    };
  }

  private taskContentModeForCurrentTemplate(): TaskContentMode {
    return this.currentTemplate()?.taskContentMode ?? "task-with-detail";
  }

  private defaultTaskContentMode(): TaskContentMode {
    const mode = this.taskContentModeForCurrentTemplate();
    return mode === "ask" ? "task-with-detail" : mode;
  }

  private renderTaskOptions(title: string, backAction: () => void, onConfirm: (task?: ProjectTaskOptions) => void, defaultAsTask: boolean, taskContentMode: TaskContentMode = "task-with-detail"): void {
    const lang = this.options.language;
    const contentEl = this.renderFileStepHeader(t(lang, "projectSend.taskOptions"), backAction);
    contentEl.createDiv({ cls: "memos-plus-project-section-hint", text: title });

    const form = contentEl.createDiv({ cls: "memos-plus-task-options" });

    const asTask = createCheckboxField(form, t(lang, "projectSend.asTask"), defaultAsTask);
    const contentModeField =
      taskContentMode === "ask"
        ? createSelectField(form, t(lang, "projectSend.taskContentMode"), [
            ["task-with-detail", t(lang, "projectSend.taskContentMode.task-with-detail")],
            ["task-only", t(lang, "projectSend.taskContentMode.task-only")]
          ])
        : null;
    if (contentModeField) {
      contentModeField.value = "task-with-detail";
    }
    const selectedContentMode = (): TaskContentMode => (contentModeField ? (contentModeField.value as TaskContentMode) : taskContentMode);
    let buildTaskOptions = (): ProjectTaskOptions | undefined => (asTask.checked ? { isTask: true, contentMode: selectedContentMode() } : undefined);

    if (this.options.taskSettings.enabled) {
      const priority = createSelectField(form, t(lang, "projectSend.priority"), [
        ["none", t(lang, "taskPriority.none")],
        ["highest", t(lang, "taskPriority.highest")],
        ["high", t(lang, "taskPriority.high")],
        ["medium", t(lang, "taskPriority.medium")],
        ["low", t(lang, "taskPriority.low")],
        ["lowest", t(lang, "taskPriority.lowest")]
      ]);
      priority.value = this.options.taskSettings.defaultPriority;

      const startDate = createDateField(form, t(lang, "projectSend.startDate"));
      const scheduledDate = createDateField(form, t(lang, "projectSend.scheduledDate"));
      scheduledDate.value = this.options.taskSettings.defaultScheduledDate;
      const dueDate = createDateField(form, t(lang, "projectSend.dueDate"));
      dueDate.value = this.options.taskSettings.defaultDueDate;
      const doneDate = createDateField(form, t(lang, "projectSend.doneDate"));

      const recurrence = createSelectField(form, t(lang, "projectSend.recurrence"), [
        ["none", t(lang, "taskRecurrence.none")],
        ["daily", t(lang, "taskRecurrence.daily")],
        ["weekly", t(lang, "taskRecurrence.weekly")],
        ["monthly", t(lang, "taskRecurrence.monthly")],
        ["yearly", t(lang, "taskRecurrence.yearly")],
        ["custom", t(lang, "taskRecurrence.custom")]
      ]);
      recurrence.value = this.options.taskSettings.defaultRecurrence;
      const customRecurrence = createTextField(form, t(lang, "projectSend.customRecurrence"), "every 2 weeks");
      const addCreatedDate = createCheckboxField(form, t(lang, "projectSend.addCreatedDate"), this.options.taskSettings.addCreatedDate);

      const updateDisabledState = (): void => {
        const disabled = !asTask.checked;
        for (const control of [priority, startDate, scheduledDate, dueDate, doneDate, recurrence, customRecurrence, addCreatedDate]) {
          control.toggleAttribute("disabled", disabled);
        }
        customRecurrence.toggleAttribute("disabled", disabled || recurrence.value !== "custom");
      };
      asTask.addEventListener("change", updateDisabledState);
      recurrence.addEventListener("change", updateDisabledState);
      updateDisabledState();

      buildTaskOptions = (): ProjectTaskOptions | undefined =>
        asTask.checked
          ? {
              isTask: true,
              priority: normalizeTaskPriority(priority.value),
              startDate: normalizeTaskDate(startDate.value),
              scheduledDate: normalizeTaskDate(scheduledDate.value),
              dueDate: normalizeTaskDate(dueDate.value),
              doneDate: normalizeTaskDate(doneDate.value),
              recurrence: normalizeTaskRecurrence(recurrence.value),
              customRecurrence: customRecurrence.value.trim(),
              addCreatedDate: addCreatedDate.checked,
              contentMode: selectedContentMode()
            }
          : undefined;
    }

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    const confirm = footer.createEl("button", { cls: "memos-plus-save-button", text: t(lang, "projectSend.confirm") });
    confirm.addEventListener("click", () => {
      void withMobileClickLock(confirm, () => onConfirm(buildTaskOptions()));
    });
  }

  private renderTemplateCreateButton(container: HTMLElement, target: "project" | "file", tag = ""): void {
    const button = container.createEl("button", { cls: "memos-plus-project-add memos-plus-template-create-button", attr: { type: "button" } });
    setIcon(button, "plus");
    button.createSpan({ text: t(this.options.language, "fileTemplateLibrary.useTemplateCreate") });
    button.addEventListener("click", () => this.openFileTemplateLibraryModal(target, tag));
  }

  private renderFileSearchCreateButton(container: HTMLElement): HTMLButtonElement {
    const button = container.createEl("button", {
      cls: "memos-plus-project-add memos-plus-project-create-file",
      attr: { type: "button" }
    });
    setIcon(button, "file-plus");
    button.createSpan({ cls: "memos-plus-project-add-label" });
    this.updateFileSearchCreateButton(button);
    button.addEventListener("click", () => void withMobileClickLock(button, () => this.openFileTemplateLibraryModal("file")));
    return button;
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

  private openFileTemplateLibraryModal(target: "project" | "file", tag = ""): void {
    const deliveryTemplate = this.currentTemplate();
    new FileTemplateLibraryModal(this.app, {
      language: this.options.language,
      initialTitle: this.templateCreateTitle(target, tag),
      initialTag: tag,
      preferredPath: this.options.getPreferredFileTemplatePath?.(tag) || this.options.preferredFileTemplatePath,
      onLoad: this.options.onLoadFileTemplates,
      onToggleFavorite: this.options.onToggleFileTemplateFavorite,
      onDelete: this.options.onDeleteFileTemplate,
      onCreate: async (template, title) => {
        const file = await this.options.onCreateFromFileTemplate(template.path, title, tag);
        if (!file) {
          return;
        }
        await this.options.onMarkFileTemplateRecent(template.path);
        if (target === "project") {
          await this.renderProjectHeadingPicker({
            file,
            name: file.basename,
            status: "进行中",
            updatedAt: file.stat?.mtime ?? Date.now(),
            isRecent: false
          });
          return;
        }
         this.chooseFile(
           file,
           deliveryTemplate?.heading ?? "",
           deliveryTemplate?.insertPosition ?? this.options.defaultFileInsertPosition,
           deliveryTemplate,
           undefined,
           false,
           this.fileTargetOptionsFromTemplate(deliveryTemplate)
         );
      }
    }).open();
  }

  private templateCreateTitle(target: "project" | "file", tag = ""): string {
    if (target === "project") {
      return this.query.trim();
    }
    return this.fileQuery.trim() || this.tagQuery.trim() || tag;
  }

  private renderCreateProject(): void {
    const lang = this.options.language;
    const contentEl = this.renderFileStepHeader(t(lang, "projectSend.addProject"), () => this.renderProjectList());

    const input = contentEl.createEl("input", {
      cls: "memos-plus-project-name-input",
      attr: { type: "text", placeholder: t(lang, "projectSend.projectNamePlaceholder") }
    });
    const create = contentEl.createEl("button", { cls: "memos-plus-save-button", text: t(lang, "projectSend.createProject") });
    const submit = async (): Promise<void> => {
      const name = input.value.trim();
      if (!name) {
        new Notice(t(lang, "projectSend.projectNameRequired"));
        focusOnDesktopOnly(input);
        return;
      }
      create.setAttr("disabled", "true");
      try {
        const project = await this.options.onCreateProject(name);
        if (project) {
          await this.renderProjectHeadingPicker(project);
        }
      } catch (error) {
        console.error("[Memos Plus] Failed to create project", error);
      } finally {
        create.removeAttribute("disabled");
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void withMobileClickLock(create, submit);
      }
    });
    create.addEventListener("click", () => void withMobileClickLock(create, submit));
    focusOnDesktopOnly(input);
  }

  private chooseProjectFileTarget(
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
    this.options.onChoose({ file, section: heading, task, mode: "project", fileTarget: { heading, position, createHeadingIfMissing, ...targetOptions }, template });
    this.close();
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

  private fileTargetOptionsFromTemplate(template: ManagedTemplate | undefined): Partial<FileSendTarget> {
    if (!template || template.insertLocation !== "new-heading") {
      return {};
    }
    return {
      newHeadingName: template.newHeadingName,
      newHeadingLevel: template.newHeadingLevel,
      newHeadingPosition: template.newHeadingPosition,
      existingHeadingBehavior: template.existingHeadingBehavior
    };
  }

  private filteredProjects(): ProjectInfo[] {
    const query = this.query.trim().toLowerCase();
    if (!query) {
      return this.projects;
    }
    return this.projects.filter((project) => `${project.name} ${project.status}`.toLowerCase().includes(query));
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

  private async openCustomTagTab(tag: string): Promise<void> {
    this.mode = "custom-tag";
    this.activeCustomTag = tag;
    await this.renderCustomTagFiles(tag);
  }

  private addCustomTagTab(): Promise<void> {
    return promptForProjectTagTab(this.app, this.options.language, async (value) => {
      const tag = normalizeFileTag(value);
      if (!tag) {
        return;
      }
      if (!this.customTagTabs.includes(tag)) {
        this.customTagTabs = uniqueTags([...this.customTagTabs, tag]);
        this.tabOrder = normalizeTabOrder([...this.tabOrder, getCustomTabId(tag)], this.customTagTabs);
        await this.options.onSaveCustomTagTabs([...this.customTagTabs]);
        await this.persistTabPreferences();
      }
      await this.openCustomTagTab(tag);
    });
  }

  private openCustomTagTabMenu(event: MouseEvent, tag: string): void {
    event.preventDefault();
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(t(this.options.language, "projectSend.renameTagTab"))
        .setIcon("pencil")
        .onClick(() => void this.renameCustomTagTab(tag));
    });
    menu.addItem((item) => {
      item.setTitle(t(this.options.language, "projectSend.removeTagTab"))
        .setIcon("x")
        .onClick(() => void this.removeCustomTagTab(tag));
    });
    menu.showAtMouseEvent(event);
  }

  private renameCustomTagTab(tag: string): Promise<void> {
    return promptForProjectTagTab(
      this.app,
      this.options.language,
      async (value) => {
        const nextTag = normalizeFileTag(value);
        if (!nextTag || nextTag === tag) {
          return;
        }
        const oldId = getCustomTabId(tag);
        const nextId = getCustomTabId(nextTag);
        this.customTagTabs = uniqueTags(this.customTagTabs.map((item) => (item === tag ? nextTag : item)));
        this.tabOrder = normalizeTabOrder(this.tabOrder.map((id) => (id === oldId ? nextId : id)), this.customTagTabs);
        this.hiddenTabs = normalizeHiddenTabs(this.hiddenTabs.map((id) => (id === oldId ? nextId : id)), this.customTagTabs);
        await this.options.onSaveCustomTagTabs([...this.customTagTabs]);
        await this.persistTabPreferences();
        if (this.mode === "custom-tag" && this.activeCustomTag === tag) {
          await this.openCustomTagTab(nextTag);
          return;
        }
        this.renderCurrentMode();
      },
      tag,
      "projectSend.renameTagTab",
      "projectSend.renameTagTab"
    );
  }

  private async removeCustomTagTab(tag: string): Promise<void> {
    const id = getCustomTabId(tag);
    this.customTagTabs = this.customTagTabs.filter((item) => item !== tag);
    this.tabOrder = normalizeTabOrder(this.tabOrder.filter((item) => item !== id), this.customTagTabs);
    this.hiddenTabs = normalizeHiddenTabs(this.hiddenTabs.filter((item) => item !== id), this.customTagTabs);
    await this.options.onSaveCustomTagTabs([...this.customTagTabs]);
    await this.persistTabPreferences();
    if (this.mode === "custom-tag" && this.activeCustomTag === tag) {
      this.mode = "tag";
      this.activeCustomTag = "";
      void this.ensureTagsLoaded();
      this.renderTagPicker();
      return;
    }
    this.renderCurrentMode();
  }
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

function normalizeTabOrder(value: string[], customTags: string[]): string[] {
  const validIds = getTabIds(customTags);
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

function normalizeHiddenTabs(value: string[], customTags: string[]): string[] {
  const validIds = getTabIds(customTags);
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

function getTabIds(customTags: string[]): string[] {
  return [...FIXED_SEND_TABS, ...customTags.map(getCustomTabId)];
}

function getCustomTabId(tag: string): string {
  return `${CUSTOM_TAB_PREFIX}${tag}`;
}

function getCustomTagFromTabId(id: string): string | null {
  if (!id.startsWith(CUSTOM_TAB_PREFIX)) {
    return null;
  }
  const tag = normalizeFileTag(id.slice(CUSTOM_TAB_PREFIX.length));
  return tag || null;
}

function projectInfoToTaggedFileInfo(project: ProjectInfo): TaggedFileInfo {
  return {
    file: project.file,
    name: project.name,
    path: project.file.path,
    tags: [],
    matchTags: [],
    status: project.status,
    updatedAt: project.updatedAt
  };
}

function isFixedSendMode(id: string): id is FixedSendMode {
  return (FIXED_SEND_TABS as readonly string[]).includes(id);
}

function createField(container: HTMLElement, labelText: string): HTMLElement {
  const field = container.createDiv({ cls: "memos-plus-task-option-field" });
  field.createEl("label", { text: labelText });
  return field;
}

function createCheckboxField(container: HTMLElement, labelText: string, checked: boolean): HTMLInputElement {
  const field = createField(container, labelText);
  const input = field.createEl("input", { attr: { type: "checkbox" } });
  input.checked = checked;
  return input;
}

function createDateField(container: HTMLElement, labelText: string): HTMLInputElement {
  const field = createField(container, labelText);
  return field.createEl("input", { attr: { type: "date" } });
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

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
