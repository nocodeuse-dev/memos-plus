import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const deliverySource = readFileSync("src/projectDelivery.ts", "utf8");
const composerActionsSource = readFileSync("src/composerActions.ts", "utf8");
const mobilePanelSource = readFileSync("src/mobilePanelView.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("project send modal source", () => {
  it("uses real Markdown headings for project delivery instead of fixed project sections", () => {
    expect(modalSource).toContain("ProjectSendModal");
    expect(modalSource).toContain("renderTaskOptions");
    expect(modalSource).not.toContain("renderProjectList");
    expect(modalSource).not.toContain("renderProjectHeadingPicker");
    expect(modalSource).not.toContain("renderCreateProject");
    expect(modalSource).not.toContain("projectSend.addProject");
    expect(modalSource).not.toContain("renderSectionPicker");
    expect(modalSource).not.toContain("handleProjectSectionChoice");
    expect(modalSource).not.toContain("chooseProject(file");
    expect(modalSource).not.toContain("this.options.sections");
    expect(modalSource).toContain("fileSend.selectPosition");
  });

  it("saves directly to the normal memo destination", () => {
    expect(modalSource).toContain("projectSend.directSend");
    expect(modalSource).toContain("onSaveDefault?: () => Promise<void>");
    expect(modalSource).toContain("await onSaveDefault()");
    expect(composerActionsSource).toContain("onSaveDefault: saveDefault");
    expect(viewSource).toContain("createComposerSession");
    expect(modalSource).toContain("if (this.options.onSaveDefault)");
    expect(modalSource).not.toContain("selectedProject");
    expect(modalSource).not.toContain("chooseDefaultProject");
    expect(viewSource).not.toContain("projectInsertHeading: this.plugin.settings.projectInsertHeading");
    expect(modalSource.match(/renderDirectSendButton\(footer\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(modalSource).toContain("renderDefaultMemoTemplate");
  });

  it("supports persisted custom tag tabs in the project send modal", () => {
    expect(modalSource).toContain("fileTemplateTabs");
    expect(modalSource).toContain("template-group");
    expect(modalSource).toContain("tag-filter");
    expect(modalSource).toContain("fileTemplateTabInteraction");
    expect(modalSource).toContain("tabOrder");
    expect(modalSource).toContain("hiddenTabs");
    expect(modalSource).toContain("projectSend.addTagTab");
    expect(modalSource).toContain("class ProjectTemplateTabModal extends Modal");
    expect(modalSource).toContain("new ProjectTemplateTabModal");
    expect(modalSource).toContain("await this.onSubmit(value,");
    expect(modalSource).not.toContain("prompt(t(lang, \"projectSend.addTagTabPrompt\")");
    expect(modalSource).toContain("renderFileTemplateTab");
    expect(modalSource).toContain("renderTemplateGroupTab");
    expect(modalSource).toContain('button.setAttr("draggable", "true")');
    expect(modalSource).toContain("dropTab(event: DragEvent");
    expect(modalSource).toContain("memos-plus-project-send-tab-close");
    expect(modalSource).toContain("renameFileTemplateTab");
    expect(modalSource).toContain("removeFileTemplateTab");
    expect(modalSource).not.toContain("contentEl.createEl(\"h2\", { text: title });");
    expect(deliverySource).toContain("fileTemplateTabs: host.settings.fileTemplateTabs");
    expect(deliverySource).toContain("fileTemplateTabInteraction: host.settings.fileTemplateTabInteraction");
    expect(deliverySource).toContain("tabOrder: host.settings.projectSendTabOrder");
    expect(deliverySource).toContain("hiddenTabs: host.settings.projectSendHiddenTabs");
    expect(deliverySource).toContain("onSaveFileTemplateTabs");
    expect(deliverySource).toContain("onSaveTabPreferences");
  });

  it("gates template-tab drag interactions by desktop and mobile interaction settings", () => {
    const modeTabsSource = modalSource.slice(modalSource.indexOf("private renderModeTabs"), modalSource.indexOf("private visibleTabIds"));
    const libraryModalSource = modalSource.slice(modalSource.indexOf("class FileTemplateLibraryModal"), modalSource.indexOf("export class ProjectSendModal"));

    expect(modalSource).toContain("private canReorderTabs()");
    expect(modalSource).toContain("private isMobileTemplateTabsReadOnly()");
    expect(modeTabsSource).toContain("if (this.canReorderTabs())");
    expect(modeTabsSource).not.toContain('draggable: "true"');
    expect(libraryModalSource).not.toContain("this.canDragTemplatesIntoTabs()");
    expect(libraryModalSource).not.toContain('button.setAttr("draggable", "true")');
    expect(libraryModalSource).not.toContain("dragover");
  });

  it("keeps the template library modal to all plus template groups and the add entry", () => {
    const libraryModalSource = modalSource.slice(modalSource.indexOf("class FileTemplateLibraryModal"), modalSource.indexOf("export class ProjectSendModal"));
    const deliveryOptionsSource = deliverySource.slice(deliverySource.indexOf("const modalOptions"), deliverySource.indexOf("onLoadFileTemplates"));

    expect(libraryModalSource).toContain("FILE_TEMPLATE_LIBRARY_TAB_ALL");
    expect(libraryModalSource).toContain("fileTemplateLibrary.category.all");
    expect(libraryModalSource).toContain("memos-plus-file-template-tab-add");
    expect(libraryModalSource).toContain("getVisibleFileTemplateLibraryTabIds");
    expect(libraryModalSource).toContain("getFileTemplateLibraryTemplateGroupTab");
    expect(libraryModalSource).toContain("filterFileTemplateLibraryItemsForTab");
    expect(libraryModalSource).toContain("fileTemplateLibrary.emptyGroup");
    expect(libraryModalSource).toContain("createTemplateGroupFileTemplateTab");
    expect(libraryModalSource).not.toContain("createTagFilterFileTemplateTab");
    expect(libraryModalSource).not.toContain("fileTemplateLibrary.searchPlaceholder");
    expect(libraryModalSource).not.toContain("FILE_TEMPLATE_LIBRARY_TAB_FAVORITE");
    expect(libraryModalSource).not.toContain("FILE_TEMPLATE_LIBRARY_TAB_RECENT");
    expect(libraryModalSource).not.toContain("getFileTemplateLibraryCategoryTabId");
    expect(libraryModalSource).not.toContain("createSelectField(contentEl, t(this.language, \"projectSend.addTemplateTabType\")");
    expect(libraryModalSource).not.toContain("private canReorderLibraryTabs()");
    expect(libraryModalSource).not.toContain("private async dropLibraryTab");
    expect(deliveryOptionsSource).toContain("fileTemplateLibraryDefaultTabId: host.settings.fileTemplateLibraryDefaultTabId");
    expect(deliveryOptionsSource).toContain("fileTemplateLibraryTabOrder: host.settings.fileTemplateLibraryTabOrder");
    expect(deliveryOptionsSource).not.toContain("fileTemplateLibraryInteraction");
  });

  it("opens the target file only after successful send or transfer when enabled", () => {
    expect(deliverySource).toContain("export async function maybeOpenTargetFileAfterSend");
    expect(deliverySource).toContain("if (!settings.openTargetFileAfterSend)");
    expect(deliverySource).toContain("await app.workspace.getLeaf(false).openFile(file)");
    expect(composerActionsSource).toContain("maybeOpenTargetFileAfterSend");
    expect(composerActionsSource).toContain("await maybeOpenTargetFileAfterSend(host.app, host.settings, delivery.file)");
    expect(viewSource).toContain("maybeOpenTargetFileAfterSend");
    expect(viewSource).toContain("await maybeOpenTargetFileAfterSend(this.app, this.plugin.settings, delivery.file)");
  });

  it("keeps format rules internal without letting them control the selected destination tab", () => {
    expect(modalSource).toContain("initialTemplateId");
    expect(modalSource).toContain("private currentTemplate()");
    expect(deliverySource).toContain("chooseInitialFormatRule");
    expect(deliverySource).toContain("initialMode");
    expect(deliverySource).toContain("initialMode,");
    expect(modalSource).toContain("template?: ManagedTemplate");
    expect(modalSource).toContain("template })");
    expect(modalSource).not.toContain("this.applyCurrentTemplateDefaults()");
    expect(modalSource).not.toContain("private applyCurrentTemplateDefaults()");
    expect(deliverySource).not.toContain("modeForTemplate");
    expect(modalSource).not.toContain("renderTemplateSelector");
    expect(modalSource).not.toContain("projectSend.currentTemplate");
    expect(modalSource).not.toContain("memos-plus-project-template-selector");
  });

  it("uses the separate new-file template library for empty search creation", () => {
    const libraryModalSource = modalSource.slice(modalSource.indexOf("class FileTemplateLibraryModal"), modalSource.indexOf("export class ProjectSendModal"));

    expect(modalSource).toContain("FileTemplateLibraryModal");
    expect(modalSource).toContain("onLoadFileTemplates");
    expect(modalSource).toContain("onCreateFromFileTemplate");
    expect(modalSource).not.toContain("onToggleFileTemplateFavorite");
    expect(libraryModalSource).not.toContain("toggleFavorite");
    expect(libraryModalSource).not.toContain("fileTemplateLibrary.favorite");
    expect(libraryModalSource).not.toContain("star-off");
    expect(libraryModalSource).not.toContain("setIcon(favorite");
    expect(libraryModalSource).toContain("memos-plus-file-template-actions");
    expect(libraryModalSource).toContain("more-horizontal");
    expect(modalSource).toContain("onDeleteFileTemplate");
    expect(libraryModalSource).not.toContain("addTemplatePathToFileTemplateTab");
    expect(libraryModalSource).toContain("filterFileTemplateLibraryItemsForTab");
    expect(libraryModalSource).toContain("fileTemplateLibrary.emptyGroup");
    expect(libraryModalSource).not.toContain("notice.fileTemplateTabAdded");
    expect(modalSource).toContain("this.listEl.createDiv({");
    expect(modalSource).toContain('row.setAttr("role", "button")');
    expect(modalSource).not.toContain('this.listEl.createEl("button", {\n        cls: `memos-plus-file-template-item');
    expect(modalSource).not.toContain("class TemplateCreateModal");
    expect(modalSource).not.toContain("private readonly templates: ManagedTemplate[]");
    expect(deliverySource).toContain("onLoadFileTemplates");
    expect(deliverySource).toContain("createFileFromLibraryTemplate");
  });

  it("keeps new file creation in the search results footer instead of adding a top tab", () => {
    const fileSearchSource = modalSource.slice(modalSource.indexOf("private async renderFileSearch()"), modalSource.indexOf("private async renderFileSearchContent"));
    const modeTabsSource = modalSource.slice(modalSource.indexOf("private renderModeTabs"), modalSource.indexOf("private visibleTabIds"));

    expect(modalSource).toContain('const FIXED_SEND_TABS: SendMode[] = ["search"];');
    expect(modalSource).not.toContain('"project", "tag", "recent", "search"');
    expect(modalSource).not.toContain("renderProjectList");
    expect(modalSource).not.toContain("renderTagPicker");
    expect(modalSource).not.toContain("renderRecentFiles");
    expect(deliverySource).not.toContain("onLoadProjects");
    expect(deliverySource).not.toContain("onLoadTags");
    expect(modeTabsSource).not.toContain("createFileFromSearch");
    expect(fileSearchSource).toContain('memos-plus-project-search-footer');
    expect(fileSearchSource).toContain("this.renderFileSearchCreateButton(footer)");
    expect(fileSearchSource).toContain("this.updateFileSearchCreateButton(createFile)");
    expect(modalSource).toContain("private renderFileSearchCreateButton");
    expect(modalSource).toContain("this.openFileTemplateLibraryModal()");
    expect(stylesSource).toContain(".memos-plus-project-search-footer");
    expect(stylesSource).toContain("position: sticky");
    expect(stylesSource).toContain("padding-bottom: 10px");
    expect(i18nSource).toContain('"projectSend.createFileFromSearch": "新建文件"');
    expect(i18nSource).toContain('"projectSend.createFileFromSearchNamed": "新建“{query}”"');
  });

  it("offers tab-scoped quick new-file creation through the existing template library flow", () => {
    const customTagSource = modalSource.slice(modalSource.indexOf("private renderCustomTagFilesContent"), modalSource.indexOf("private async renderTemplateGroupTab"));
    const templateGroupSource = modalSource.slice(modalSource.indexOf("private renderTemplateGroupTabContent"), modalSource.indexOf("private renderScopedTabSearchInput"));
    const mobileFooterSource = mobilePanelSource.slice(mobilePanelSource.indexOf("private renderTargetFooter"), mobilePanelSource.indexOf("private async saveDefault"));

    expect(modalSource).toContain("tabTemplateBindings?: Record<string, string>;");
    expect(modalSource).toContain("private renderQuickCreateFooter");
    expect(modalSource).toContain("openQuickCreateForActiveTab");
    expect(modalSource).toContain("preferredTemplatePathForActiveTab");
    expect(modalSource).toContain("this.openFileTemplateLibraryModal(tag, preferredPath)");
    expect(customTagSource).toContain("this.renderQuickCreateFooter");
    expect(templateGroupSource).toContain("this.renderQuickCreateFooter");
    expect(mobilePanelSource).toContain("openQuickCreateForActiveTab");
    expect(mobilePanelSource).toContain("preferredTemplatePathForActiveTab");
    expect(mobileFooterSource).toContain("this.openQuickCreateForActiveTab");
    expect(deliverySource).toContain("tabTemplateBindings: host.settings.tabTemplateBindings");
    expect(i18nSource).toContain('"projectSend.tabTemplateMissing"');
    expect(i18nSource).toContain('"settings.tabTemplateBindings"');
  });

  it("shows recent Memos Plus file targets for empty mobile search without scanning all files", () => {
    const fileSearchContentSource = modalSource.slice(
      modalSource.indexOf("private async renderFileSearchContent"),
      modalSource.indexOf("private renderFileList(")
    );
    const mobileRecentIndex = fileSearchContentSource.indexOf("this.shouldShowMobileRecentFileTargets(query)");
    const searchIndex = fileSearchContentSource.indexOf("await this.searchFilesCached(query)");

    expect(modalSource).toContain("onLoadRecentFiles: () => Promise<TaggedFileInfo[]>");
    expect(modalSource).toContain("private recentFilesCache: TaggedFileInfo[] | null = null;");
    expect(modalSource).toContain("private async loadRecentFilesCached(): Promise<TaggedFileInfo[]>");
    expect(modalSource).toContain("private async renderMobileRecentFileTargets");
    expect(modalSource).toContain("const MOBILE_EMPTY_SEARCH_RECENT_FILE_LIMIT = 10;");
    expect(modalSource).toContain("files.slice(0, MOBILE_EMPTY_SEARCH_RECENT_FILE_LIMIT)");
    expect(modalSource).toContain("fileSend.noRecentFilesSearchHint");
    expect(modalSource).toContain("return Platform.isMobile && !query.trim();");
    expect(deliverySource).toContain("onLoadRecentFiles: () => host.store.getRecentFileTargets()");
    expect(mobileRecentIndex).toBeGreaterThanOrEqual(0);
    expect(searchIndex).toBeGreaterThan(mobileRecentIndex);
    expect(i18nSource).toContain('"fileSend.noRecentFilesSearchHint": "暂无最近文件，请输入关键词搜索"');
  });

  it("filters file targets inside the active tag tab without falling back to global search", () => {
    const customTagSource = modalSource.slice(modalSource.indexOf("private async renderCustomTagFiles"), modalSource.indexOf("private async renderTemplateGroupTab"));
    const mobileTagSource = mobilePanelSource.slice(
      mobilePanelSource.indexOf("private async renderTagTabResults"),
      mobilePanelSource.indexOf("private renderFileOptions")
    );

    expect(modalSource).toContain("private readonly tabSearchQueries = new Map<string, string>();");
    expect(modalSource).toContain("private renderScopedTabSearchInput");
    expect(modalSource).toContain("filterTaggedFilesByQuery");
    expect(customTagSource).toContain("this.renderScopedTabSearchInput");
    expect(customTagSource).toContain("this.renderScopedTagFileList");
    expect(customTagSource).not.toContain("this.options.onSearchFiles");
    expect(mobilePanelSource).toContain("private readonly tabSearchQueries = new Map<string, string>();");
    expect(mobilePanelSource).toContain("private renderTargetSearchInput");
    expect(mobilePanelSource).toContain("filterTaggedFilesByQuery");
    expect(mobileTagSource).toContain("this.renderTargetSearchInput");
    expect(mobileTagSource).not.toContain("options.onSearchFiles");
    expect(i18nSource).toContain('"fileSend.searchInTab": "在「{tab}」中搜索"');
    expect(i18nSource).toContain('"fileSend.noFilesInTab": "当前标签页中没有匹配文件"');
  });

  it("adds mobile template-group tabs to the template creation view", () => {
    const mobileTemplateSource = mobilePanelSource.slice(
      mobilePanelSource.indexOf("private async renderTemplatePicker"),
      mobilePanelSource.indexOf("private async createFileFromTemplate")
    );

    expect(mobilePanelSource).toContain("mobileTemplateTabId");
    expect(mobilePanelSource).toContain("mobileTemplateTabsScrollLeft");
    expect(mobilePanelSource).toContain("mobileTemplateQuery");
    expect(mobilePanelSource).toContain("private renderMobileTemplateTabs");
    expect(mobilePanelSource).toContain("getVisibleFileTemplateLibraryTabIds");
    expect(mobilePanelSource).toContain("getFileTemplateLibraryTemplateGroupTab");
    expect(mobilePanelSource).toContain("filterFileTemplateLibraryItemsForTab");
    expect(mobileTemplateSource).toContain("this.renderMobileTemplateTabs");
    expect(mobileTemplateSource).toContain("this.renderMobileTemplateSearchInput");
    expect(mobileTemplateSource).toContain("this.renderMobileTemplateList");
    expect(mobileTemplateSource).not.toContain("FILE_TEMPLATE_LIBRARY_TAB_FAVORITE");
    expect(mobileTemplateSource).not.toContain("FILE_TEMPLATE_LIBRARY_TAB_RECENT");
    expect(stylesSource).toContain(".memos-plus-mobile-template-tabs");
    expect(stylesSource).toContain(".memos-plus-mobile-template-search");
  });

  it("routes files created from the template library through the existing heading picker", () => {
    const templateModalSource = modalSource.slice(
      modalSource.indexOf("private openFileTemplateLibraryModal("),
      modalSource.indexOf("private templateCreateTitle(")
    );

    expect(templateModalSource).toContain("onCreateFromFileTemplate");
    expect(templateModalSource).toContain("this.renderCreatedFileHeadingPicker(file, tag)");
    expect(templateModalSource).not.toContain('if (target === "project")');
    expect(templateModalSource).not.toContain("this.chooseFile(");
    expect(modalSource).toContain("fileTemplateLibrary.createFailed");
    expect(i18nSource).toContain('"fileTemplateLibrary.createFailed"');
  });

  it("the composer send-to-project flow opens the project workflow modal", () => {
    expect(deliverySource).toContain("ProjectSendModal");
    expect(deliverySource).toContain("selectProjectTarget");
    expect(deliverySource).toContain("taskSettings");
    expect(deliverySource).not.toContain("createProject");
    expect(viewSource).toContain("sendContentToProject(");
  });

  it("uses template-owned task decisions instead of fixed task section names", () => {
    expect(modalSource).toContain("resolveTemplateTaskDecision");
    expect(modalSource).toContain("findManagedTemplateForHeading");
    expect(modalSource).toContain("private templateForHeading(heading: string)");
    expect(mobilePanelSource).toContain("findManagedTemplateForHeading");
    expect(mobilePanelSource).toContain("private templateForHeading(heading: string)");
    expect(modalSource).toContain("handleFileTargetChoice");
    expect(modalSource).toContain("taskDecisionFor");
    expect(modalSource).not.toContain('normalized === this.options.taskSettings.defaultSection || normalized === "待办" || normalized === "任务"');
  });

  it("does not open task options just because a format rule resolves to task", () => {
    expect(modalSource).not.toContain('decision === "task" && this.options.taskSettings.promptOnCreate');
  });

  it("offers a new-heading insert target with heading name, level, location, and duplicate handling", () => {
    expect(modalSource).toContain('"new-heading"');
    expect(modalSource).toContain("fileSend.newHeadingName");
    expect(modalSource).toContain("fileSend.newHeadingLevel");
    expect(modalSource).toContain("fileSend.newHeadingPosition");
    expect(modalSource).toContain("fileSend.existingHeadingBehavior");
    expect(modalSource).toContain("newHeadingName");
    expect(modalSource).toContain("newHeadingLevel");
    expect(modalSource).toContain("existingHeadingBehavior");
  });

  it("lets the heading picker own insert defaults instead of reading them from format rules", () => {
    const headingPickerSource = modalSource.slice(modalSource.indexOf("private async renderHeadingPicker"), modalSource.indexOf("private async renderProjectHeadingPicker"));

    expect(headingPickerSource).toContain("this.options.defaultFileInsertPosition");
    expect(headingPickerSource).toContain("this.defaultInsertHeading()");
    expect(headingPickerSource).not.toContain("this.currentTemplate()?.insertPosition");
    expect(headingPickerSource).not.toContain("this.currentTemplate()?.newHeadingName");
    expect(headingPickerSource).not.toContain("this.currentTemplate()?.newHeadingLevel");
    expect(headingPickerSource).not.toContain("this.currentTemplate()?.newHeadingPosition");
    expect(headingPickerSource).not.toContain("this.currentTemplate()?.existingHeadingBehavior");
    expect(modalSource).not.toContain("fileTargetOptionsFromTemplate");
  });

  it("writes send modal selections through file targets without project-only mode", () => {
    expect(modalSource).not.toContain("chooseProjectFileTarget");
    expect(modalSource).not.toContain('mode: "project"');
    expect(deliverySource).toContain("if (choice.fileTarget)");
    expect(deliverySource).toContain("sendToFileTarget(choice.file");
    expect(deliverySource).not.toContain('choice.mode === "project"');
    expect(deliverySource).not.toContain("sendToProjectFile(choice.file");
  });

  it("debounces custom tag tabs and file-search inputs without rebuilding their modal shells", () => {
    const customTagSource = modalSource.slice(modalSource.indexOf("private async renderCustomTagFiles"), modalSource.indexOf("private async renderTemplateGroupTab"));
    const fileSearchSource = modalSource.slice(modalSource.indexOf("private async renderFileSearch()"), modalSource.indexOf("private renderFileList("));
    const fileInputHandler = fileSearchSource.match(/search\.addEventListener\("input", \(\) => \{([\s\S]*?)\n {4}\}\);/)?.[1] ?? "";

    expect(customTagSource).toContain("this.loadTaggedFileTabResults(tab)");
    expect(customTagSource).not.toContain("renderTagPicker()");

    expect(fileSearchSource).toContain("void this.renderFileSearchContent(list)");
    expect(fileSearchSource).toContain("void this.renderFileSearchContent(list);");
    expect(fileInputHandler).not.toContain("renderFileSearch()");
    expect(modalSource).toContain("private async renderFileSearchContent(list: HTMLElement): Promise<void>");
  });

  it("uses a shared inline list item renderer with metadata for send modal lists", () => {
    const fileMetaSource = modalSource.slice(
      modalSource.indexOf("private fileMetaParts"),
      modalSource.indexOf("private async renderHeadingPicker")
    );

    expect(modalSource).toContain("private renderSendListOption");
    expect(modalSource).not.toContain("private renderProjectOption");
    expect(modalSource).toContain("private renderFileInfoOption");
    expect(modalSource).not.toContain("projectMetaParts(project)");
    expect(modalSource).toContain("fileMetaParts(info)");
    expect(modalSource).not.toContain("isRecentFile(info)");
    expect(modalSource).toContain("memos-plus-project-option-title-text");
    expect(modalSource).toContain("memos-plus-project-option-meta-inline");
    expect(modalSource).toContain("memos-plus-project-option-meta-text");
    expect(modalSource).not.toContain('button.createDiv({ cls: "memos-plus-project-option-meta"');
    expect(fileMetaSource).not.toContain("matchTags");
    expect(fileMetaSource).not.toContain("info.tags");
    expect(fileMetaSource).not.toContain("`#${tag}`");
  });

  it("keeps send modal list rows left-aligned and clipped without horizontal overflow", () => {
    expect(modalSource).toContain('this.modalEl.addClass("memos-plus-project-send-modal-shell")');
    expect(stylesSource).toContain(".memos-plus-project-send-modal *");
    expect(stylesSource).toContain(".memos-plus-project-send-modal-shell .modal-content");
    expect(stylesSource).toContain(".memos-plus-project-send-modal button.memos-plus-project-option");
    expect(stylesSource).toContain("flex-direction: row");
    expect(stylesSource).toContain("align-items: center");
    expect(stylesSource).toContain("justify-content: flex-start");
    expect(stylesSource).toContain("text-align: left");
    expect(stylesSource).toContain("grid-template-rows: auto auto");
    expect(stylesSource).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(stylesSource).not.toContain("max-width: 48%");
    expect(stylesSource).toContain("-webkit-line-clamp: 2");
    expect(stylesSource).toContain("text-overflow: ellipsis");
    expect(stylesSource).toContain("overflow-x: hidden");
    expect(stylesSource).toContain("scrollbar-width: none");
    expect(stylesSource).toContain(".memos-plus-project-send-tabs::-webkit-scrollbar");
  });

  it("keeps the mobile target picker as a stable scrollable view instead of a modal stack", () => {
    expect(mobilePanelSource).toContain("extends ItemView");
    expect(mobilePanelSource).toContain("tabsScrollLeft");
    expect(mobilePanelSource).toContain("this.captureTabsScrollLeft()");
    expect(mobilePanelSource).toContain("tabs.scrollLeft = this.tabsScrollLeft");
    expect(mobilePanelSource).toContain("private switchTargetTab");
    expect(mobilePanelSource).toContain("this.renderTargetContent()");
    expect(mobilePanelSource).toContain("memos-plus-mobile-target-body");
    expect(mobilePanelSource).toContain("memos-plus-mobile-target-list");
    expect(mobilePanelSource).toContain("private getTargetSearchEl");
    expect(mobilePanelSource).toContain("private getTargetListEl");
    expect(mobilePanelSource).toContain("this.renderTargetFooter()");
    expect(mobilePanelSource).toContain("memos-plus-mobile-target-search");
    expect(mobilePanelSource).toContain("memos-plus-mobile-panel-footer");
    expect(mobilePanelSource).toContain('this.contentEl.createDiv({ cls: "memos-plus-mobile-target-search" })');
    expect(mobilePanelSource).toContain('this.contentEl.createDiv({ cls: "memos-plus-mobile-target-body" })');
    expect(mobilePanelSource).toContain('searchArea.removeClass("is-hidden")');
    expect(mobilePanelSource).toContain('querySelector(".memos-plus-mobile-target-list")');
    expect(mobilePanelSource).not.toContain('const searchArea = body.createDiv({ cls: "memos-plus-mobile-target-search" })');
    expect(mobilePanelSource).not.toContain("extends Modal");
    expect(stylesSource).toContain(".memos-plus-mobile-panel-tabs");
    expect(stylesSource).toContain(".memos-plus-mobile-target-body");
    expect(stylesSource).toContain(".memos-plus-mobile-target-list");
    expect(stylesSource).toContain(".memos-plus-mobile-target-search");
    expect(stylesSource).toContain(".memos-plus-mobile-target-search.is-hidden");
    expect(stylesSource).toContain("flex-wrap: nowrap");
    expect(stylesSource).toContain("white-space: nowrap");
    expect(stylesSource).toContain("flex: 0 0 auto");
    expect(stylesSource).toContain("flex: 1 1 auto");
    expect(stylesSource).toContain("min-height: 96px");
    expect(stylesSource).toContain("height: 44px");
    expect(stylesSource).toContain("height: 48px");
    expect(stylesSource).toContain("transform: none");
    expect(stylesSource).toContain("position: relative");
    expect(stylesSource).toContain("inset 0 -2px 0 var(--interactive-accent)");
    expect(stylesSource).toContain("env(safe-area-inset-bottom");
  });
});
