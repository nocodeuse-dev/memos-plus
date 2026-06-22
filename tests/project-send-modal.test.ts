import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const deliverySource = readFileSync("src/projectDelivery.ts", "utf8");
const composerActionsSource = readFileSync("src/composerActions.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("project send modal source", () => {
  it("uses real Markdown headings for project delivery instead of fixed project sections", () => {
    expect(modalSource).toContain("ProjectSendModal");
    expect(modalSource).toContain("renderProjectList");
    expect(modalSource).toContain("renderProjectHeadingPicker");
    expect(modalSource).toContain("renderTaskOptions");
    expect(modalSource).toContain("renderCreateProject");
    expect(modalSource).toContain("projectSend.addProject");
    expect(modalSource).not.toContain("renderSectionPicker");
    expect(modalSource).not.toContain("handleProjectSectionChoice");
    expect(modalSource).not.toContain("chooseProject(file");
    expect(modalSource).not.toContain("this.options.sections");
    expect(modalSource).toContain("projectSend.chooseSection");
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
    expect(modalSource).toContain("enableTemplateTabDrag");
    expect(modalSource).toContain("tabOrder");
    expect(modalSource).toContain("hiddenTabs");
    expect(modalSource).toContain("projectSend.addTagTab");
    expect(modalSource).toContain("class ProjectTemplateTabModal extends Modal");
    expect(modalSource).toContain("new ProjectTemplateTabModal");
    expect(modalSource).toContain("await this.onSubmit(value,");
    expect(modalSource).not.toContain("prompt(t(lang, \"projectSend.addTagTabPrompt\")");
    expect(modalSource).toContain("renderFileTemplateTab");
    expect(modalSource).toContain("renderTemplateGroupTab");
    expect(modalSource).toContain("draggable: \"true\"");
    expect(modalSource).toContain("dropTab(event: DragEvent");
    expect(modalSource).toContain("memos-plus-project-send-tab-close");
    expect(modalSource).toContain("renameFileTemplateTab");
    expect(modalSource).toContain("removeFileTemplateTab");
    expect(modalSource).not.toContain("contentEl.createEl(\"h2\", { text: title });");
    expect(deliverySource).toContain("fileTemplateTabs: host.settings.fileTemplateTabs");
    expect(deliverySource).toContain("enableTemplateTabDrag: host.settings.enableTemplateTabDrag");
    expect(deliverySource).toContain("tabOrder: host.settings.projectSendTabOrder");
    expect(deliverySource).toContain("hiddenTabs: host.settings.projectSendHiddenTabs");
    expect(deliverySource).toContain("onSaveFileTemplateTabs");
    expect(deliverySource).toContain("onSaveTabPreferences");
  });

  it("keeps template rules internal without showing a current-template selector", () => {
    expect(modalSource).toContain("initialTemplateId");
    expect(modalSource).toContain("private currentTemplate()");
    expect(modalSource).toContain("this.applyCurrentTemplateDefaults()");
    expect(modalSource).toContain("template?: ManagedTemplate");
    expect(modalSource).toContain("template })");
    expect(modalSource).not.toContain("renderTemplateSelector");
    expect(modalSource).not.toContain("projectSend.currentTemplate");
    expect(modalSource).not.toContain("memos-plus-project-template-selector");
  });

  it("uses the separate new-file template library for empty search creation", () => {
    expect(modalSource).toContain("FileTemplateLibraryModal");
    expect(modalSource).toContain("onLoadFileTemplates");
    expect(modalSource).toContain("onCreateFromFileTemplate");
    expect(modalSource).toContain("onToggleFileTemplateFavorite");
    expect(modalSource).toContain("onDeleteFileTemplate");
    expect(modalSource).toContain("filterFileTemplateLibraryItemsForTab");
    expect(modalSource).toContain("addTemplatePathToFileTemplateTab");
    expect(modalSource).toContain("fileTemplateLibrary.emptyGroup");
    expect(modalSource).toContain("notice.fileTemplateTabAdded");
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

    expect(modalSource).toContain('const FIXED_SEND_TABS: FixedSendMode[] = ["project", "tag", "recent", "search"];');
    expect(modeTabsSource).not.toContain("createFileFromSearch");
    expect(fileSearchSource).toContain('memos-plus-project-search-footer');
    expect(fileSearchSource).toContain("this.renderFileSearchCreateButton(footer)");
    expect(fileSearchSource).toContain("this.updateFileSearchCreateButton(createFile)");
    expect(modalSource).toContain("private renderFileSearchCreateButton");
    expect(modalSource).toContain('this.openFileTemplateLibraryModal("file")');
    expect(stylesSource).toContain(".memos-plus-project-search-footer");
    expect(stylesSource).toContain("position: sticky");
    expect(stylesSource).toContain("padding-bottom: 10px");
    expect(i18nSource).toContain('"projectSend.createFileFromSearch": "新建文件"');
    expect(i18nSource).toContain('"projectSend.createFileFromSearchNamed": "新建“{query}”"');
  });

  it("the composer send-to-project flow opens the project workflow modal", () => {
    expect(deliverySource).toContain("ProjectSendModal");
    expect(deliverySource).toContain("selectProjectTarget");
    expect(deliverySource).toContain("taskSettings");
    expect(deliverySource).toContain("createProject");
    expect(viewSource).toContain("sendContentToProject(");
  });

  it("uses template-owned task decisions instead of fixed task section names", () => {
    expect(modalSource).toContain("resolveTemplateTaskDecision");
    expect(modalSource).toContain("handleFileTargetChoice");
    expect(modalSource).toContain("taskDecisionFor");
    expect(modalSource).not.toContain('normalized === this.options.taskSettings.defaultSection || normalized === "待办" || normalized === "任务"');
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

  it("keeps project mode while writing through file targets", () => {
    expect(modalSource).toContain("chooseProjectFileTarget");
    expect(modalSource).toContain('mode: "project"');
    expect(deliverySource).toContain("if (choice.fileTarget)");
    expect(deliverySource).toContain("sendToFileTarget(choice.file");
    expect(deliverySource).toContain('choice.mode === "project"');
    expect(deliverySource).not.toContain("sendToProjectFile(choice.file");
  });

  it("debounces project search without rebuilding the project modal shell", () => {
    const projectListSource = modalSource.slice(modalSource.indexOf("private renderProjectList()"), modalSource.indexOf("private renderTagPicker()"));
    const inputHandler = projectListSource.match(/search\.addEventListener\("input", \(\) => \{([\s\S]*?)\n {4}\}\);/)?.[1] ?? "";

    expect(projectListSource).toContain("this.renderProjectListContent(list)");
    expect(projectListSource).toContain("debounce(() => this.renderProjectListContent(list), 200)");
    expect(inputHandler).not.toContain("renderProjectList()");
    expect(modalSource).toContain("private renderProjectListContent(list: HTMLElement): void");
    expect(modalSource).toContain("return this.projects;");
  });

  it("debounces tag-file and file-search inputs without rebuilding their modal shells", () => {
    const tagPickerSource = modalSource.slice(modalSource.indexOf("private renderTagPicker()"), modalSource.indexOf("private async renderTaggedFiles"));
    const tagInputHandler = tagPickerSource.match(/search\.addEventListener\("input", \(\) => \{([\s\S]*?)\n {4}\}\);/)?.[1] ?? "";
    const fileSearchSource = modalSource.slice(modalSource.indexOf("private async renderFileSearch()"), modalSource.indexOf("private renderFileList("));
    const fileInputHandler = fileSearchSource.match(/search\.addEventListener\("input", \(\) => \{([\s\S]*?)\n {4}\}\);/)?.[1] ?? "";

    expect(tagPickerSource).toContain("this.renderTagPickerContent(list)");
    expect(tagPickerSource).toContain("debounce(() => this.renderTagPickerContent(list), 200)");
    expect(tagInputHandler).not.toContain("renderTagPicker()");
    expect(modalSource).toContain("private renderTagPickerContent(list: HTMLElement): void");

    expect(fileSearchSource).toContain("void this.renderFileSearchContent(list)");
    expect(fileSearchSource).toContain("void this.renderFileSearchContent(list);");
    expect(fileInputHandler).not.toContain("renderFileSearch()");
    expect(modalSource).toContain("private async renderFileSearchContent(list: HTMLElement): Promise<void>");
  });

  it("uses a shared inline list item renderer with metadata for send modal lists", () => {
    expect(modalSource).toContain("private renderSendListOption");
    expect(modalSource).toContain("private renderProjectOption");
    expect(modalSource).toContain("private renderFileInfoOption");
    expect(modalSource).toContain("projectMetaParts(project)");
    expect(modalSource).toContain("fileMetaParts(info)");
    expect(modalSource).toContain("isRecentFile(info)");
    expect(modalSource).toContain("memos-plus-project-option-title-text");
    expect(modalSource).toContain("memos-plus-project-option-meta-inline");
    expect(modalSource).toContain("memos-plus-project-option-meta-text");
    expect(modalSource).not.toContain('button.createDiv({ cls: "memos-plus-project-option-meta"');
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
    expect(stylesSource).toContain("text-overflow: ellipsis");
    expect(stylesSource).toContain("overflow-x: hidden");
    expect(stylesSource).toContain("scrollbar-width: none");
    expect(stylesSource).toContain(".memos-plus-project-send-tabs::-webkit-scrollbar");
  });
});
