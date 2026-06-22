import { App, type TFile } from "obsidian";
import { prepareCalloutContent } from "./callout";
import { normalizeFileTag } from "./fileSend";
import { normalizeFileTemplateLibraryTabOrder, normalizeFileTemplateTabs, toggleFavoriteFileTemplatePath, updateRecentFileTemplatePaths } from "./fileTemplateLibrary";
import type { MemosPlusSettings } from "./settings";
import type { MemosPlusStore } from "./store";
import { updateRecentFileTargetPaths } from "./fileSend";
import { ProjectSendModal, type ProjectSendChoice } from "./projectFileSuggestModal";
import { updateRecentProjectPaths } from "./projectSend";
import { createDefaultProjectTemplate, resolveTemplateClearAfterSend, type ManagedTemplate } from "./templateManager";

export interface ProjectDeliveryHost {
  app: App;
  store: MemosPlusStore;
  settings: MemosPlusSettings;
  persistSettings: () => Promise<void>;
}

export interface ProjectDeliveryResult {
  mode: "project" | "file";
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
  const templates = availableTemplates(host.settings);
  const initialTemplate = chooseInitialTemplate(templates, options.initialMode);
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
    if (choice.mode === "project") {
      host.settings.recentProjectPaths = updateRecentProjectPaths(host.settings.recentProjectPaths, choice.file.path);
    } else {
      host.settings.recentFileTargetPaths = updateRecentFileTargetPaths(host.settings.recentFileTargetPaths, choice.file.path);
    }
    await host.persistSettings();
    return {
      mode: choice.mode === "project" ? "project" : "file",
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
  templates: ManagedTemplate[] = availableTemplates(host.settings),
  initialTemplate?: ManagedTemplate
): Promise<ProjectSendChoice | null> {
  return new Promise((resolve) => {
    new ProjectSendModal(host.app, {
      language: host.settings.language,
      content,
      defaultHeading: host.settings.defaultProjectSection,
      initialMode: initialTemplate ? modeForTemplate(initialTemplate, initialMode) : initialMode,
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
      commonFileTags: host.settings.sendToFileCommonTags,
      customTagTabs: host.settings.projectSendTagTabs,
      fileTemplateTabs: host.settings.fileTemplateTabs,
      fileTemplateTabInteraction: host.settings.fileTemplateTabInteraction,
      fileTemplateLibraryDefaultTabId: host.settings.fileTemplateLibraryDefaultTabId,
      fileTemplateLibraryTabOrder: host.settings.fileTemplateLibraryTabOrder,
      fileTemplateLibraryInteraction: host.settings.fileTemplateLibraryInteraction,
      tabOrder: host.settings.projectSendTabOrder,
      hiddenTabs: host.settings.projectSendHiddenTabs,
      templates,
      initialTemplateId: initialTemplate?.id,
      defaultFileTag: host.settings.sendToFileDefaultTag,
      defaultFileInsertPosition: host.settings.sendToFileDefaultInsertPosition,
      noHeadingBehavior: host.settings.sendToFileNoHeadingBehavior,
      onLoadProjects: () => host.store.getProjects(),
      onLoadRecentFiles: () => host.store.getRecentFileTargets(),
      onCreateProject: async (name) => {
        const file = await host.store.createProject(name);
        return {
          file,
          name: file.basename,
          status: "进行中",
          updatedAt: file.stat?.mtime ?? Date.now(),
          isRecent: false
        };
      },
      onLoadFileTemplates: () => host.store.getFileTemplateLibraryItems(),
      onCreateFromFileTemplate: async (templatePath, title, tag) => host.store.createFileFromLibraryTemplate(templatePath, title, { tag }),
      onToggleFileTemplateFavorite: async (templatePath) => {
        host.settings.fileTemplateLibraryFavorites = toggleFavoriteFileTemplatePath(host.settings.fileTemplateLibraryFavorites, templatePath);
        await host.persistSettings();
      },
      onDeleteFileTemplate: async (templatePath) => {
        await host.store.deleteFileTemplate(templatePath);
        host.settings.fileTemplateLibraryFavorites = host.settings.fileTemplateLibraryFavorites.filter((item) => item !== templatePath);
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
      preferredFileTemplatePath: preferredFileTemplatePath(host.settings, initialTemplate),
      getPreferredFileTemplatePath: (tag) => preferredFileTemplatePathForTag(host.settings, tag),
      onLoadTags: () => host.store.getAllFileSendTags(),
      onLoadTaggedFiles: (tagQuery) => host.store.getTaggedFileTargets(tagQuery),
      onSearchFiles: (query) => host.store.searchFileTargets(query),
      onLoadHeadings: (file) => host.store.getFileTargetHeadings(file),
      onSaveCustomTagTabs: async (tags) => {
        host.settings.projectSendTagTabs = tags;
        await host.persistSettings();
      },
      onSaveFileTemplateTabs: async (tabs) => {
        host.settings.fileTemplateTabs = normalizeFileTemplateTabs(tabs);
        host.settings.projectSendTagTabs = host.settings.fileTemplateTabs.flatMap((tab) => (tab.type === "tag-filter" ? tab.tags : []));
        await host.persistSettings();
      },
      onSaveFileTemplateLibraryTabPreferences: async ({ tabOrder }) => {
        host.settings.fileTemplateLibraryTabOrder = normalizeFileTemplateLibraryTabOrder(tabOrder);
        await host.persistSettings();
      },
      onSaveTabPreferences: async ({ tabOrder, hiddenTabs }) => {
        host.settings.projectSendTabOrder = tabOrder;
        host.settings.projectSendHiddenTabs = hiddenTabs;
        await host.persistSettings();
      },
      onSaveDefault,
      onChoose: resolve
    }).open();
  });
}

function preferredFileTemplatePath(settings: MemosPlusSettings, template?: ManagedTemplate): string {
  const tag = normalizeFileTag(template?.recognitionTag || template?.defaultTags[0] || "");
  return preferredFileTemplatePathForTag(settings, tag);
}

function preferredFileTemplatePathForTag(settings: MemosPlusSettings, tagValue: string): string {
  const tag = normalizeFileTag(tagValue);
  return tag ? settings.fileTemplateLibraryDefaults[tag] ?? "" : "";
}

function availableTemplates(settings: MemosPlusSettings): ManagedTemplate[] {
  return settings.managedTemplates.length > 0
    ? settings.managedTemplates
    : [createDefaultProjectTemplate(settings.projectTag, settings.projectFolderPath, settings.defaultProjectSection)];
}

function chooseInitialTemplate(templates: ManagedTemplate[], initialMode: "project" | "tag" | "recent" | "search"): ManagedTemplate | undefined {
  const source =
    initialMode === "project"
      ? "project-tag"
      : initialMode === "tag"
        ? "specific-tag"
        : initialMode === "recent"
          ? "recent-file"
          : "vault-search";
  return templates.find((template) => template.targetSource === source) ?? templates[0];
}

function modeForTemplate(template: ManagedTemplate, fallback: "project" | "tag" | "recent" | "search"): "project" | "tag" | "recent" | "search" | "custom-tag" {
  if (template.targetSource === "project-tag") {
    return "project";
  }
  if (template.targetSource === "specific-tag") {
    return template.recognitionTag || template.defaultTags[0] ? "custom-tag" : "tag";
  }
  if (template.targetSource === "recent-file") {
    return "recent";
  }
  if (template.targetSource === "vault-search" || template.targetSource === "fixed-file" || template.targetSource === "new-file") {
    return "search";
  }
  return fallback;
}
