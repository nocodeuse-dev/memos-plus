import { App, Platform, type TFile } from "obsidian";
import { prepareCalloutContent } from "./callout";
import { normalizeFileTag } from "./fileSend";
import {
  getVisibleFileTemplateLibraryTabIds,
  normalizeFileTemplateTabs,
  normalizeVisibleFileTemplateLibraryDefaultTabId,
  updateRecentFileTemplatePaths
} from "./fileTemplateLibrary";
import type { MemosPlusSettings } from "./settings";
import type { MemosPlusStore } from "./store";
import { updateRecentFileTargetPaths } from "./fileSend";
import { ProjectSendModal, type ProjectSendChoice, type ProjectSendModalOptions } from "./projectFileSuggestModal";
import { createDefaultProjectTemplate, resolveTemplateClearAfterSend, type ManagedTemplate } from "./templateManager";

export interface ProjectDeliveryHost {
  app: App;
  store: MemosPlusStore;
  settings: MemosPlusSettings;
  persistSettings: () => Promise<void>;
  selectProjectTargetOnMobile?: (options: ProjectSendModalOptions) => Promise<ProjectSendChoice | null>;
}

export interface ProjectDeliveryResult {
  mode: "file";
  file: TFile;
  template?: ManagedTemplate;
  clearAfterSend?: boolean;
}

export interface SendContentToProjectOptions {
  initialMode: "project" | "tag" | "recent" | "search";
  manualCalloutMode: boolean;
  onSaveDefault?: () => Promise<void>;
}

export async function maybeOpenTargetFileAfterSend(app: App, settings: MemosPlusSettings, file: TFile): Promise<void> {
  if (!settings.openTargetFileAfterSend) {
    return;
  }
  try {
    await app.workspace.getLeaf(false).openFile(file);
  } catch (error) {
    console.error("[Memos Plus] Failed to open target file after send", error);
  }
}

export async function sendContentToProject(
  host: ProjectDeliveryHost,
  content: string,
  options: SendContentToProjectOptions
): Promise<ProjectDeliveryResult | null> {
  const initialTemplate = chooseInitialFormatRule(host.settings, options.initialMode);
  const templates = availableTemplates(host.settings, initialTemplate);
  const choice = await selectProjectTarget(host, content, options.initialMode, options.onSaveDefault, templates, initialTemplate);
  if (!choice) {
    return null;
  }

  const template = choice.template;
  const prepared = prepareCalloutContent(content, host.settings, options.manualCalloutMode || template?.insertFormat === "callout", {
    file: choice.file.basename,
    project: choice.file.basename,
    heading: choice.section,
    now: new Date()
  });
  if (choice.fileTarget) {
    await host.store.sendToFileTarget(choice.file, prepared.content, choice.fileTarget, choice.task, {
      preformatted: prepared.preformatted,
      template
    });
    host.settings.recentFileTargetPaths = updateRecentFileTargetPaths(host.settings.recentFileTargetPaths, choice.file.path);
    await host.persistSettings();
    return {
      mode: "file",
      file: choice.file,
      template,
      clearAfterSend: resolveTemplateClearAfterSend(template, host.settings.clearAfterSave)
    };
  }

  return null;
}

async function selectProjectTarget(
  host: ProjectDeliveryHost,
  content: string,
  initialMode: "project" | "tag" | "recent" | "search" = "project",
  onSaveDefault?: () => Promise<void>,
  templates?: ManagedTemplate[],
  initialTemplate?: ManagedTemplate
): Promise<ProjectSendChoice | null> {
  const selectedInitialTemplate = initialTemplate ?? chooseInitialFormatRule(host.settings, initialMode);
  const formatRules = templates ?? availableTemplates(host.settings, selectedInitialTemplate);
  const modalOptions: ProjectSendModalOptions = {
    language: host.settings.language,
    content,
    defaultHeading: host.settings.defaultProjectSection,
    initialMode,
    taskSettings: {
      enabled: host.settings.tasksFormatEnabled,
      defaultSection: host.settings.taskDefaultSection,
      addCreatedDate: host.settings.taskAddCreatedDate,
      defaultPriority: host.settings.taskDefaultPriority,
      defaultDueDate: host.settings.taskDefaultDueDate,
      defaultScheduledDate: host.settings.taskDefaultScheduledDate,
      defaultRecurrence: host.settings.taskDefaultRecurrence,
      promptOnCreate: host.settings.taskPromptOnCreate
    },
    enableFileTargets: host.settings.sendToFileEnabled,
    customTagTabs: host.settings.projectSendTagTabs,
    fileTemplateTabs: host.settings.fileTemplateTabs,
    fileTemplateTabInteraction: host.settings.fileTemplateTabInteraction,
    performanceSettings: {
      mobilePerformanceMode: host.settings.mobilePerformanceMode,
      performanceSafeMode: host.settings.performanceSafeMode
    },
    fileTemplateLibraryDefaultTabId: host.settings.fileTemplateLibraryDefaultTabId,
    fileTemplateLibraryTabOrder: host.settings.fileTemplateLibraryTabOrder,
    tabTemplateBindings: host.settings.tabTemplateBindings,
    tabOrder: host.settings.projectSendTabOrder,
    hiddenTabs: host.settings.projectSendHiddenTabs,
    templates: formatRules,
    initialTemplateId: selectedInitialTemplate.id,
    defaultFileTag: host.settings.sendToFileDefaultTag,
    defaultFileInsertPosition: host.settings.sendToFileDefaultInsertPosition,
    noHeadingBehavior: host.settings.sendToFileNoHeadingBehavior,
    onLoadFileTemplates: () => host.store.getFileTemplateLibraryItems(),
    onCreateFromFileTemplate: async (templatePath, title, tag) => host.store.createFileFromLibraryTemplate(templatePath, title, { tag }),
    onDeleteFileTemplate: async (templatePath) => {
      await host.store.deleteFileTemplate(templatePath);
      host.settings.fileTemplateLibraryRecent = host.settings.fileTemplateLibraryRecent.filter((item) => item !== templatePath);
      for (const [tag, path] of Object.entries(host.settings.fileTemplateLibraryDefaults)) {
        if (path === templatePath) {
          delete host.settings.fileTemplateLibraryDefaults[tag];
        }
      }
      await host.persistSettings();
    },
    onMarkFileTemplateRecent: async (templatePath) => {
      host.settings.fileTemplateLibraryRecent = updateRecentFileTemplatePaths(host.settings.fileTemplateLibraryRecent, templatePath);
      await host.persistSettings();
    },
    preferredFileTemplatePath: "",
    getPreferredFileTemplatePath: (tag) => preferredFileTemplatePathForTag(host.settings, tag),
    onOpenTabTemplateBindings: () => {
      const setting = (host.app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
      setting?.open?.();
      setting?.openTabById?.("memos-plus");
    },
    onLoadTaggedFiles: (tagQuery) => host.store.getTaggedFileTargets(tagQuery),
    onLoadRecentFiles: () => host.store.getRecentFileTargets(),
    onSearchFiles: (query) => host.store.searchFileTargets(query),
    onLoadHeadings: (file) => host.store.getFileTargetHeadings(file),
    onSaveCustomTagTabs: async (tags) => {
      host.settings.projectSendTagTabs = tags;
      await host.persistSettings();
    },
    onSaveFileTemplateTabs: async (tabs) => {
      host.settings.fileTemplateTabs = normalizeFileTemplateTabs(tabs);
      host.settings.projectSendTagTabs = host.settings.fileTemplateTabs.flatMap((tab) => (tab.type === "tag-filter" ? tab.tags : []));
      host.settings.tabTemplateBindings = normalizeRuntimeTabTemplateBindings(host.settings.tabTemplateBindings, host.settings.fileTemplateTabs);
      host.settings.fileTemplateLibraryTabOrder = getVisibleFileTemplateLibraryTabIds(
        host.settings.fileTemplateTabs,
        host.settings.fileTemplateLibraryTabOrder
      );
      host.settings.fileTemplateLibraryDefaultTabId = normalizeVisibleFileTemplateLibraryDefaultTabId(
        host.settings.fileTemplateLibraryDefaultTabId,
        host.settings.fileTemplateTabs
      );
      await host.persistSettings();
    },
    onSaveFileTemplateLibraryPreferences: async ({ defaultTabId, tabOrder }) => {
      if (tabOrder) {
        host.settings.fileTemplateLibraryTabOrder = getVisibleFileTemplateLibraryTabIds(host.settings.fileTemplateTabs, tabOrder);
      }
      if (defaultTabId) {
        host.settings.fileTemplateLibraryDefaultTabId = normalizeVisibleFileTemplateLibraryDefaultTabId(defaultTabId, host.settings.fileTemplateTabs);
      }
      await host.persistSettings();
    },
    onSaveTabPreferences: async ({ tabOrder, hiddenTabs }) => {
      host.settings.projectSendTabOrder = tabOrder;
      host.settings.projectSendHiddenTabs = hiddenTabs;
      await host.persistSettings();
    },
    onSaveDefault,
    onChoose: () => undefined
  };
  if (Platform.isMobile && host.settings.mobileInteractionMode === "view" && host.selectProjectTargetOnMobile) {
    return host.selectProjectTargetOnMobile(modalOptions);
  }
  return new Promise((resolve) => {
    new ProjectSendModal(host.app, { ...modalOptions, onChoose: resolve }).open();
  });
}

function normalizeRuntimeTabTemplateBindings(bindings: Record<string, string>, tabs: MemosPlusSettings["fileTemplateTabs"]): Record<string, string> {
  const validIds = new Set(tabs.map((tab) => `custom:${tab.id}`));
  return Object.fromEntries(Object.entries(bindings).filter(([tabId, templatePath]) => validIds.has(tabId) && Boolean(templatePath)));
}

function preferredFileTemplatePathForTag(settings: MemosPlusSettings, tagValue: string): string {
  const tag = normalizeFileTag(tagValue);
  return tag ? settings.fileTemplateLibraryDefaults[tag] ?? "" : "";
}

function availableTemplates(settings: MemosPlusSettings, initialTemplate: ManagedTemplate): ManagedTemplate[] {
  if (settings.managedTemplates.some((template) => template.id === initialTemplate.id)) {
    return settings.managedTemplates;
  }
  return [initialTemplate, ...settings.managedTemplates];
}

function chooseInitialFormatRule(settings: MemosPlusSettings, initialMode: "project" | "tag" | "recent" | "search"): ManagedTemplate {
  const templates = settings.managedTemplates;
  const source =
    initialMode === "project"
      ? "project-tag"
      : initialMode === "tag"
        ? "specific-tag"
        : initialMode === "recent"
          ? "recent-file"
          : "vault-search";
  return (
    templates.find((template) => template.targetSource === source) ??
    templates.find((template) => template.targetSource === "default-memo") ??
    createDefaultProjectTemplate(settings.projectTag, settings.projectFolderPath, settings.defaultProjectSection)
  );
}
