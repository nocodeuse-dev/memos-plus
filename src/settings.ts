import { App, Platform, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type MemosPlusPlugin from "../main";
import {
  CALLOUT_TYPES,
  DEFAULT_CALLOUT_SETTINGS,
  normalizeCalloutFoldMode,
  normalizeCalloutThreshold,
  normalizeCalloutTitleMode,
  normalizeCalloutType,
  type CalloutFoldMode,
  type CalloutTitleMode,
  type CalloutType
} from "./callout";
import {
  COMPOSER_TOOLBAR_TOOL_IDS,
  DEFAULT_COMPOSER_TOOLBAR_SETTINGS,
  normalizeComposerToolbarSettings,
  type ComposerToolbarSettings,
  type ComposerToolbarToolId
} from "./composerTools";
import type { SortOrder } from "./filter";
import {
  CONFIGURABLE_ICON_ITEM_DEFINITIONS,
  normalizeIconOverrideConfig,
  normalizeIconOverrides,
  sidebarItemIconOverrideId,
  type IconOverrideConfig,
  type IconOverrideType,
  type IconOverrides
} from "./configurableIcons";
import {
  DISPLAY_SURFACES,
  DISPLAY_LAYOUT_MODES,
  DEFAULT_VIEW_LAYOUTS,
  copyViewLayoutToSurface,
  getDisplayModule,
  modulesForSurface,
  normalizeViewLayout,
  sameViewLayoutForAllSurfaces,
  type DisplayModuleDefinition,
  type DisplayModuleId,
  type DisplaySurface,
  type ViewLayoutSettings
} from "./displayModules";
import {
  COMPOSER_LAYOUT_GROUP,
  HOME_TOOLBAR_LAYOUT_GROUP,
  HOME_RESULTS_LAYOUT_GROUP,
  SIDEBAR_NAVIGATION_LAYOUT_GROUP,
  orderedLayoutRegions,
  orderedModulesInGroup,
  resolveLayoutSurfaceModules
} from "./layoutRenderer";
import {
  DEFAULT_SEND_TO_FILE_COMMON_TAGS,
  normalizeFileInsertPosition,
  normalizeFileTag,
  normalizeNoHeadingBehavior,
  normalizeSendToFileCommonTags,
  type FileInsertPosition,
  type NoHeadingBehavior
} from "./fileSend";
import {
  DEFAULT_FILE_TEMPLATE_TAB_INTERACTION,
  DEFAULT_FILE_TEMPLATE_LIBRARY_INTERACTION,
  DEFAULT_FILE_TEMPLATE_LIBRARY_FOLDER,
  DEFAULT_FILE_TEMPLATE_LIBRARY_TARGET_FOLDER,
  FILE_TEMPLATE_LIBRARY_TAB_ALL,
  createTagFilterFileTemplateTab,
  createTemplateGroupFileTemplateTab,
  getFileTemplateLibraryTemplateGroupTab,
  getVisibleFileTemplateLibraryTabIds,
  legacyProjectSendTagsToFileTemplateTabs,
  normalizeFileTemplateDefaults,
  normalizeFileTemplateLibraryInteraction,
  normalizeVisibleFileTemplateLibraryDefaultTabId,
  normalizeFileTemplateTabInteraction,
  normalizeFileTemplateLibraryDefaultFolder,
  normalizeFileTemplateLibraryFolder,
  normalizeFileTemplateLibraryPaths,
  normalizeFileTemplateTabs,
  type FileTemplateLibraryInteractionSettings,
  type FileTemplateTabInteractionSettings,
  type FileTemplateTab
} from "./fileTemplateLibrary";
import { normalizeImageHandlingMode, type ImageHandlingMode } from "./imageHandling";
import { DEFAULT_LANGUAGE, Language, t } from "./i18n";
import { normalizeTagList } from "./linkCapture";
import {
  normalizeMemoProjectTransferAfterAction,
  type MemoProjectTransferAfterAction
} from "./memoProjectTransfer";
import {
  DEFAULT_ORGANIZER_PANEL_DESKTOP_HEIGHT,
  DEFAULT_ORGANIZER_PANEL_MOBILE_HEIGHT,
  DEFAULT_ORGANIZER_PANEL_SECTIONS,
  DEFAULT_TASK_MANAGEMENT_VISIBLE_ITEMS,
  ORGANIZER_PANEL_SECTION_DEFINITIONS,
  TASK_MANAGEMENT_VISIBLE_ITEM_DEFINITIONS,
  normalizeOrganizerMemoStates,
  normalizeOrganizerPanelHeight,
  normalizeOrganizerPanelSections,
  normalizeTaskManagementVisibleItems,
  type OrganizerMemoStates,
  type OrganizerPanelSectionsSettings,
  type TaskManagementVisibleItemsSettings
} from "./organizerPanel";
import {
  DEFAULT_MOBILE_LIGHT_HOME_RECENT_COUNT,
  DEFAULT_MOBILE_LIGHT_HOME_SECTIONS,
  DEFAULT_MOBILE_HOME_CUSTOM_MODULES,
  DEFAULT_MOBILE_HOME_LAYOUT,
  normalizeMobileLightHomeRecentCount,
  normalizeMobileLightHomeSections,
  normalizeMobileHomeCustomModules,
  normalizeMobileHomeLayout,
  type MobileHomeCustomModules,
  type MobileHomeLayout,
  type MobileLightHomeSectionsSettings
} from "./mobileLightHome";
import type { MemoDefaultPrefix } from "./prefix";
import { normalizeProjectTag } from "./projectSend";
import { normalizeSavedSearches, type SavedSearch } from "./savedSearch";
import { normalizeSidebarItems, type SidebarItem } from "./sidebar";
import { normalizeTaskDate, normalizeTaskPriority, normalizeTaskRecurrence, type TaskPriority, type TaskRecurrence } from "./tasksFormat";
import type { TaskIndexStatus } from "./taskIndex";
import {
  cloneManagedTemplate,
  normalizeManagedTemplates,
  type ManagedTemplate
} from "./templateManager";
import { TemplateEditorModal } from "./templateManagerModal";
import { logMemosPlusDiagnostic } from "./diagnostics";

export interface MemosPlusSettings {
  memoFolderPath: string;
  attachmentFolder: string;
  imageHandlingMode: ImageHandlingMode;
  composerBorderColor: string;
  composerBackgroundColor: string;
  defaultSendAction: DefaultSendAction;
  quickInputEnabled: boolean;
  quickInputAutoOpen: boolean;
  quickInputPreserveDraft: boolean;
  quickInputDefaultSendAction: DefaultSendAction;
  quickInputDraft: string;
  quickInputShowDirectory: boolean;
  quickInputDirectoryLimit: number;
  quickInputDirectoryExpandedLimit: number;
  quickInputDirectoryMobileExpandedLimit: number;
  organizerPanelEnabled: boolean;
  organizerPanelDefaultCollapsed: boolean;
  organizerPanelDesktopHeight: number;
  organizerPanelMobileHeight: number;
  organizerPanelSections: OrganizerPanelSectionsSettings;
  organizerMemoStates: OrganizerMemoStates;
  organizerTaskPriorityBranchesEnabled: boolean;
  organizerTaskDateBranchesEnabled: boolean;
  organizerTasksDefaultExpanded: boolean;
  taskManagementVisibleItems: TaskManagementVisibleItemsSettings;
  taskVaultFilterEnabled: boolean;
  taskIndexEnabled: boolean;
  taskIndexAutoBuild: boolean;
  taskIndexDelayOnMobile: boolean;
  quickCaptureAutoSelection: boolean;
  quickCaptureDetectClipboard: boolean;
  quickCaptureClipboardMode: QuickCaptureClipboardMode;
  quickCaptureExistingContentMode: QuickCaptureExistingContentMode;
  quickCaptureRecognizeClipboardLinks: boolean;
  linkAnalysisEnabled: boolean;
  linkAnalysisMobileEnabled: boolean;
  linkAnalysisMaxLinks: number;
  linkAnalysisTimeoutMs: number;
  memoProjectTransferAfterAction: MemoProjectTransferAfterAction;
  calloutEnabled: boolean;
  calloutType: CalloutType;
  calloutFoldMode: CalloutFoldMode;
  calloutTitleMode: CalloutTitleMode;
  calloutTitleTemplate: string;
  calloutAutoForLongContent: boolean;
  calloutAutoLength: number;
  calloutAutoLines: number;
  calloutAutoForLinks: boolean;
  composerToolbar: ComposerToolbarSettings;
  clearAfterSave: boolean;
  openTargetFileAfterSend: boolean;
  sendFailureDraftEnabled: boolean;
  sendFailureDraftContent: string;
  sortOrder: SortOrder;
  pageSize: number;
  performanceDebugMode: boolean;
  mobilePerformanceMode: boolean;
  performanceSafeMode: boolean;
  showArchived: boolean;
  mobileFab: boolean;
  mobileLightHomeEnabled: boolean;
  mobileLightHomeRecentCount: number;
  mobileLightHomeSections: MobileLightHomeSectionsSettings;
  mobileLightHomeShowLaterButton: boolean;
  mobileHomeLayout: MobileHomeLayout;
  mobileHomeCustomModules: MobileHomeCustomModules;
  homeLayout: ViewLayoutSettings;
  sidebarLayout: ViewLayoutSettings;
  mobileLayout: ViewLayoutSettings;
  language: Language;
  defaultPrefix: MemoDefaultPrefix;
  allMemosIcon: string;
  iconOverrides: IconOverrides;
  savedSearches: SavedSearch[];
  sidebarItems: SidebarItem[];
  linkCaptureDefaultTags: string[];
  projectTag: string;
  projectFolderPath: string;
  defaultProjectSection: string;
  showArchivedProjects: boolean;
  projectSections: string[];
  recentProjectPaths: string[];
  sendToFileEnabled: boolean;
  sendToFileDefaultTag: string;
  sendToFileCommonTags: string[];
  projectSendTagTabs: string[];
  projectSendTabOrder: string[];
  projectSendHiddenTabs: string[];
  managedTemplates: ManagedTemplate[];
  fileTemplateLibraryFolder: string;
  fileTemplateLibraryDefaultFolder: string;
  fileTemplateLibraryFavorites: string[];
  fileTemplateLibraryRecent: string[];
  fileTemplateLibraryDefaults: Record<string, string>;
  fileTemplateLibraryDefaultTabId: string;
  fileTemplateLibraryTabOrder: string[];
  fileTemplateLibraryInteraction: FileTemplateLibraryInteractionSettings;
  fileTemplateTabs: FileTemplateTab[];
  fileTemplateTabInteraction: FileTemplateTabInteractionSettings;
  sendToFileDefaultInsertPosition: FileInsertPosition;
  sendToFileNoHeadingBehavior: NoHeadingBehavior;
  recentFileTargetPaths: string[];
  tasksFormatEnabled: boolean;
  taskDefaultSection: string;
  taskAddCreatedDate: boolean;
  taskAddProjectTag: boolean;
  taskDefaultPriority: TaskPriority;
  taskDefaultDueDate: string;
  taskDefaultScheduledDate: string;
  taskDefaultRecurrence: TaskRecurrence;
  taskPromptOnCreate: boolean;
}

export const DEFAULT_MEMO_FOLDER = "我的资源/Memos";
export const DEFAULT_ATTACHMENT_FOLDER = `${DEFAULT_MEMO_FOLDER}/attachments`;
export const DEFAULT_PROJECT_FOLDER = "项目";
export const DEFAULT_PROJECT_SECTIONS = ["收集箱", "待办", "资料", "想法", "问题", "日志", "已完成"];
export const DEFAULT_COMPOSER_BORDER_COLOR = "#8b5cf6";
export const DEFAULT_COMPOSER_BACKGROUND_COLOR = "";
const COMPOSER_BACKGROUND_COLOR_PICKER_FALLBACK = "#1f1f1f";

export type DefaultSendAction = "memo" | "project" | "ask";
export type QuickCaptureClipboardMode = "ask" | "replace" | "append" | "off";
export type QuickCaptureExistingContentMode = "ask" | "keep" | "replace" | "append";

export const DEFAULT_SETTINGS: MemosPlusSettings = {
  memoFolderPath: DEFAULT_MEMO_FOLDER,
  attachmentFolder: DEFAULT_ATTACHMENT_FOLDER,
  imageHandlingMode: "auto",
  composerBorderColor: DEFAULT_COMPOSER_BORDER_COLOR,
  composerBackgroundColor: DEFAULT_COMPOSER_BACKGROUND_COLOR,
  defaultSendAction: "project",
  quickInputEnabled: true,
  quickInputAutoOpen: true,
  quickInputPreserveDraft: true,
  quickInputDefaultSendAction: "project",
  quickInputDraft: "",
  quickInputShowDirectory: true,
  quickInputDirectoryLimit: 20,
  quickInputDirectoryExpandedLimit: 20,
  quickInputDirectoryMobileExpandedLimit: 10,
  organizerPanelEnabled: true,
  organizerPanelDefaultCollapsed: false,
  organizerPanelDesktopHeight: DEFAULT_ORGANIZER_PANEL_DESKTOP_HEIGHT,
  organizerPanelMobileHeight: DEFAULT_ORGANIZER_PANEL_MOBILE_HEIGHT,
  organizerPanelSections: DEFAULT_ORGANIZER_PANEL_SECTIONS,
  organizerMemoStates: {},
  organizerTaskPriorityBranchesEnabled: true,
  organizerTaskDateBranchesEnabled: true,
  organizerTasksDefaultExpanded: false,
  taskManagementVisibleItems: DEFAULT_TASK_MANAGEMENT_VISIBLE_ITEMS,
  taskVaultFilterEnabled: true,
  taskIndexEnabled: true,
  taskIndexAutoBuild: true,
  taskIndexDelayOnMobile: true,
  quickCaptureAutoSelection: true,
  quickCaptureDetectClipboard: true,
  quickCaptureClipboardMode: "ask",
  quickCaptureExistingContentMode: "ask",
  quickCaptureRecognizeClipboardLinks: true,
  linkAnalysisEnabled: true,
  linkAnalysisMobileEnabled: true,
  linkAnalysisMaxLinks: 3,
  linkAnalysisTimeoutMs: 4500,
  memoProjectTransferAfterAction: "keep",
  ...DEFAULT_CALLOUT_SETTINGS,
  composerToolbar: DEFAULT_COMPOSER_TOOLBAR_SETTINGS,
  clearAfterSave: true,
  openTargetFileAfterSend: false,
  sendFailureDraftEnabled: true,
  sendFailureDraftContent: "",
  sortOrder: "newest",
  pageSize: 50,
  performanceDebugMode: false,
  mobilePerformanceMode: true,
  performanceSafeMode: false,
  showArchived: false,
  mobileFab: true,
  mobileLightHomeEnabled: true,
  mobileLightHomeRecentCount: DEFAULT_MOBILE_LIGHT_HOME_RECENT_COUNT,
  mobileLightHomeSections: DEFAULT_MOBILE_LIGHT_HOME_SECTIONS,
  mobileLightHomeShowLaterButton: true,
  mobileHomeLayout: DEFAULT_MOBILE_HOME_LAYOUT,
  mobileHomeCustomModules: DEFAULT_MOBILE_HOME_CUSTOM_MODULES,
  homeLayout: DEFAULT_VIEW_LAYOUTS.home,
  sidebarLayout: DEFAULT_VIEW_LAYOUTS.sidebar,
  mobileLayout: DEFAULT_VIEW_LAYOUTS.mobile,
  language: DEFAULT_LANGUAGE,
  defaultPrefix: "list",
  allMemosIcon: "layout-grid",
  iconOverrides: {},
  savedSearches: [],
  sidebarItems: [],
  linkCaptureDefaultTags: [],
  projectTag: "项目",
  projectFolderPath: DEFAULT_PROJECT_FOLDER,
  defaultProjectSection: "收集箱",
  showArchivedProjects: false,
  projectSections: DEFAULT_PROJECT_SECTIONS,
  recentProjectPaths: [],
  sendToFileEnabled: true,
  sendToFileDefaultTag: "",
  sendToFileCommonTags: DEFAULT_SEND_TO_FILE_COMMON_TAGS,
  projectSendTagTabs: [],
  projectSendTabOrder: ["search"],
  projectSendHiddenTabs: [],
  managedTemplates: [],
  fileTemplateLibraryFolder: DEFAULT_FILE_TEMPLATE_LIBRARY_FOLDER,
  fileTemplateLibraryDefaultFolder: DEFAULT_FILE_TEMPLATE_LIBRARY_TARGET_FOLDER,
  fileTemplateLibraryFavorites: [],
  fileTemplateLibraryRecent: [],
  fileTemplateLibraryDefaults: {},
  fileTemplateLibraryDefaultTabId: FILE_TEMPLATE_LIBRARY_TAB_ALL,
  fileTemplateLibraryTabOrder: [],
  fileTemplateLibraryInteraction: DEFAULT_FILE_TEMPLATE_LIBRARY_INTERACTION,
  fileTemplateTabs: [],
  fileTemplateTabInteraction: DEFAULT_FILE_TEMPLATE_TAB_INTERACTION,
  sendToFileDefaultInsertPosition: "heading-top",
  sendToFileNoHeadingBehavior: "ask",
  recentFileTargetPaths: [],
  tasksFormatEnabled: true,
  taskDefaultSection: "待办",
  taskAddCreatedDate: true,
  taskAddProjectTag: true,
  taskDefaultPriority: "medium",
  taskDefaultDueDate: "",
  taskDefaultScheduledDate: "",
  taskDefaultRecurrence: "none",
  taskPromptOnCreate: true
};

type SettingsTabId =
  | "layout"
  | "sendRules"
  | "inputTools"
  | "records"
  | "tasks"
  | "fileTemplates"
  | "directoryFilters"
  | "display"
  | "performanceData"
  | "advanced";

const SETTINGS_TABS: Array<{ id: SettingsTabId; labelKey: string }> = [
  { id: "layout", labelKey: "settings.tab.layout" },
  { id: "inputTools", labelKey: "settings.tab.input" },
  { id: "records", labelKey: "settings.tab.records" },
  { id: "fileTemplates", labelKey: "settings.tab.fileTemplates" },
  { id: "tasks", labelKey: "settings.tab.tasks" },
  { id: "directoryFilters", labelKey: "settings.tab.filters" },
  { id: "performanceData", labelKey: "settings.tab.performance" },
  { id: "advanced", labelKey: "settings.tab.advanced" }
];

const HOME_SIDEBAR_PREVIEW_LAYOUT_GROUP: readonly DisplayModuleId[] = [
  ...SIDEBAR_NAVIGATION_LAYOUT_GROUP,
  "statsCards",
  "heatmap"
];

const MOBILE_NAVIGATION_PREVIEW_LAYOUT_GROUP: readonly DisplayModuleId[] = HOME_SIDEBAR_PREVIEW_LAYOUT_GROUP;

const HOME_PREVIEW_LAYOUT_GROUPS: Record<string, readonly DisplayModuleId[]> = {
  toolbar: HOME_TOOLBAR_LAYOUT_GROUP,
  composer: COMPOSER_LAYOUT_GROUP,
  sidebar: HOME_SIDEBAR_PREVIEW_LAYOUT_GROUP,
  results: HOME_RESULTS_LAYOUT_GROUP
};

const SIDEBAR_PREVIEW_LAYOUT_GROUPS: Record<string, readonly DisplayModuleId[]> = {
  headerActions: ["settingsButton", "refreshButton"],
  composer: COMPOSER_LAYOUT_GROUP,
  directory: SIDEBAR_NAVIGATION_LAYOUT_GROUP,
  results: HOME_RESULTS_LAYOUT_GROUP
};

const MOBILE_PREVIEW_LAYOUT_GROUPS: Record<string, readonly DisplayModuleId[]> = {
  toolbar: HOME_TOOLBAR_LAYOUT_GROUP,
  composer: COMPOSER_LAYOUT_GROUP,
  navigation: MOBILE_NAVIGATION_PREVIEW_LAYOUT_GROUP,
  results: HOME_RESULTS_LAYOUT_GROUP
};

interface HorizontalScrollContainer {
  scrollLeft: number;
  getBoundingClientRect(): Pick<DOMRect, "left" | "right">;
}

interface HorizontalScrollTarget {
  getBoundingClientRect(): Pick<DOMRect, "left" | "right">;
  scrollIntoView(options?: ScrollIntoViewOptions): void;
}

export function restoreSettingsTabsScroll(
  tabBar: HorizontalScrollContainer,
  previousScrollLeft: number,
  activeTab?: HorizontalScrollTarget | null
): void {
  tabBar.scrollLeft = previousScrollLeft;
  if (!activeTab) {
    return;
  }
  const barRect = tabBar.getBoundingClientRect();
  const activeRect = activeTab.getBoundingClientRect();
  if (activeRect.left < barRect.left || activeRect.right > barRect.right) {
    activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

export function normalizeSettings(data: unknown): MemosPlusSettings {
  const raw = isRecord(data) ? data : {};
  const savedSearches = normalizeSavedSearches(raw.savedSearches);
  const projectSections = normalizeProjectSections(raw.projectSections);
  const defaultProjectSection = normalizeTextSetting(raw.defaultProjectSection, DEFAULT_SETTINGS.defaultProjectSection);
  const taskDefaultSection = normalizeTextSetting(raw.taskDefaultSection, DEFAULT_SETTINGS.taskDefaultSection);
  const projectSendTagTabs = normalizeProjectSendTagTabs(raw.projectSendTagTabs);
  const explicitFileTemplateTabs = normalizeFileTemplateTabs(raw.fileTemplateTabs);
  const fileTemplateTabs = explicitFileTemplateTabs.length > 0 ? explicitFileTemplateTabs : legacyProjectSendTagsToFileTemplateTabs(projectSendTagTabs);
  const projectTag = normalizeProjectTag(raw.projectTag) || DEFAULT_SETTINGS.projectTag;
  const projectFolderPath = normalizeVaultPath(raw.projectFolderPath, DEFAULT_PROJECT_FOLDER);
  const clearAfterSave = typeof raw.clearAfterSave === "boolean" ? raw.clearAfterSave : DEFAULT_SETTINGS.clearAfterSave;
  const memoProjectTransferAfterAction = normalizeMemoProjectTransferAfterAction(raw.memoProjectTransferAfterAction);
  const mobileHomeLayout = normalizeMobileHomeLayout(raw.mobileHomeLayout);
  const mobileHomeCustomModules = normalizeMobileHomeCustomModules(raw.mobileHomeCustomModules);
  const mobileLayout = isRecord(raw.mobileLayout)
    ? normalizeViewLayout(raw.mobileLayout, "mobile")
    : typeof raw.mobileHomeLayout === "string"
      ? migrateLegacyMobileHomeLayout(mobileHomeLayout, mobileHomeCustomModules)
      : DEFAULT_SETTINGS.mobileLayout;
  const normalizedManagedTemplates = normalizeManagedTemplates(raw.managedTemplates);
  const managedTemplates = normalizedManagedTemplates;
  const fileTemplateLibraryTabOrder = getVisibleFileTemplateLibraryTabIds(fileTemplateTabs, raw.fileTemplateLibraryTabOrder);
  const fileTemplateLibraryDefaultTabId = normalizeVisibleFileTemplateLibraryDefaultTabId(raw.fileTemplateLibraryDefaultTabId, fileTemplateTabs);
  let normalizedProjectSections = projectSections;
  if (!normalizedProjectSections.includes(defaultProjectSection)) {
    normalizedProjectSections = [defaultProjectSection, ...normalizedProjectSections];
  }
  if (!normalizedProjectSections.includes(taskDefaultSection)) {
    normalizedProjectSections = [taskDefaultSection, ...normalizedProjectSections];
  }
  return {
    ...DEFAULT_SETTINGS,
    memoFolderPath: normalizeVaultPath(raw.memoFolderPath, DEFAULT_MEMO_FOLDER),
    attachmentFolder: normalizeVaultPath(raw.attachmentFolder, DEFAULT_ATTACHMENT_FOLDER),
    imageHandlingMode: normalizeImageHandlingMode(raw.imageHandlingMode),
    composerBorderColor: normalizeOptionalHexColor(raw.composerBorderColor, DEFAULT_SETTINGS.composerBorderColor),
    composerBackgroundColor: normalizeOptionalHexColor(raw.composerBackgroundColor, DEFAULT_SETTINGS.composerBackgroundColor),
    defaultSendAction: normalizeDefaultSendAction(raw.defaultSendAction),
    quickInputEnabled: typeof raw.quickInputEnabled === "boolean" ? raw.quickInputEnabled : DEFAULT_SETTINGS.quickInputEnabled,
    quickInputAutoOpen: typeof raw.quickInputAutoOpen === "boolean" ? raw.quickInputAutoOpen : DEFAULT_SETTINGS.quickInputAutoOpen,
    quickInputPreserveDraft: typeof raw.quickInputPreserveDraft === "boolean" ? raw.quickInputPreserveDraft : DEFAULT_SETTINGS.quickInputPreserveDraft,
    quickInputDefaultSendAction: normalizeQuickInputSendAction(raw.quickInputDefaultSendAction ?? raw.defaultSendAction),
    quickInputDraft: typeof raw.quickInputDraft === "string" ? raw.quickInputDraft : "",
    quickInputShowDirectory:
      typeof raw.quickInputShowDirectory === "boolean" ? raw.quickInputShowDirectory : DEFAULT_SETTINGS.quickInputShowDirectory,
    quickInputDirectoryLimit: normalizeQuickInputDirectoryLimit(raw.quickInputDirectoryLimit, DEFAULT_SETTINGS.quickInputDirectoryLimit),
    quickInputDirectoryExpandedLimit: normalizeQuickInputDirectoryLimit(
      raw.quickInputDirectoryExpandedLimit,
      DEFAULT_SETTINGS.quickInputDirectoryExpandedLimit
    ),
    quickInputDirectoryMobileExpandedLimit: normalizeQuickInputDirectoryLimit(
      raw.quickInputDirectoryMobileExpandedLimit,
      DEFAULT_SETTINGS.quickInputDirectoryMobileExpandedLimit
    ),
    organizerPanelEnabled: typeof raw.organizerPanelEnabled === "boolean" ? raw.organizerPanelEnabled : DEFAULT_SETTINGS.organizerPanelEnabled,
    organizerPanelDefaultCollapsed:
      typeof raw.organizerPanelDefaultCollapsed === "boolean"
        ? raw.organizerPanelDefaultCollapsed
        : DEFAULT_SETTINGS.organizerPanelDefaultCollapsed,
    organizerPanelDesktopHeight: normalizeOrganizerPanelHeight(raw.organizerPanelDesktopHeight, DEFAULT_SETTINGS.organizerPanelDesktopHeight),
    organizerPanelMobileHeight: normalizeOrganizerPanelHeight(raw.organizerPanelMobileHeight, DEFAULT_SETTINGS.organizerPanelMobileHeight),
    organizerPanelSections: normalizeOrganizerPanelSections(raw.organizerPanelSections),
    organizerMemoStates: normalizeOrganizerMemoStates(raw.organizerMemoStates),
    organizerTaskPriorityBranchesEnabled:
      typeof raw.organizerTaskPriorityBranchesEnabled === "boolean"
        ? raw.organizerTaskPriorityBranchesEnabled
        : DEFAULT_SETTINGS.organizerTaskPriorityBranchesEnabled,
    organizerTaskDateBranchesEnabled:
      typeof raw.organizerTaskDateBranchesEnabled === "boolean" ? raw.organizerTaskDateBranchesEnabled : DEFAULT_SETTINGS.organizerTaskDateBranchesEnabled,
    organizerTasksDefaultExpanded:
      typeof raw.organizerTasksDefaultExpanded === "boolean" ? raw.organizerTasksDefaultExpanded : DEFAULT_SETTINGS.organizerTasksDefaultExpanded,
    taskManagementVisibleItems: normalizeTaskManagementVisibleItems(raw.taskManagementVisibleItems),
    taskVaultFilterEnabled:
      typeof raw.taskVaultFilterEnabled === "boolean" ? raw.taskVaultFilterEnabled : DEFAULT_SETTINGS.taskVaultFilterEnabled,
    taskIndexEnabled: typeof raw.taskIndexEnabled === "boolean" ? raw.taskIndexEnabled : DEFAULT_SETTINGS.taskIndexEnabled,
    taskIndexAutoBuild: typeof raw.taskIndexAutoBuild === "boolean" ? raw.taskIndexAutoBuild : DEFAULT_SETTINGS.taskIndexAutoBuild,
    taskIndexDelayOnMobile: typeof raw.taskIndexDelayOnMobile === "boolean" ? raw.taskIndexDelayOnMobile : DEFAULT_SETTINGS.taskIndexDelayOnMobile,
    quickCaptureAutoSelection: typeof raw.quickCaptureAutoSelection === "boolean" ? raw.quickCaptureAutoSelection : DEFAULT_SETTINGS.quickCaptureAutoSelection,
    quickCaptureDetectClipboard: typeof raw.quickCaptureDetectClipboard === "boolean" ? raw.quickCaptureDetectClipboard : DEFAULT_SETTINGS.quickCaptureDetectClipboard,
    quickCaptureClipboardMode: normalizeQuickCaptureClipboardMode(raw.quickCaptureClipboardMode),
    quickCaptureExistingContentMode: normalizeQuickCaptureExistingContentMode(raw.quickCaptureExistingContentMode),
    quickCaptureRecognizeClipboardLinks:
      typeof raw.quickCaptureRecognizeClipboardLinks === "boolean"
        ? raw.quickCaptureRecognizeClipboardLinks
        : DEFAULT_SETTINGS.quickCaptureRecognizeClipboardLinks,
    linkAnalysisEnabled: typeof raw.linkAnalysisEnabled === "boolean" ? raw.linkAnalysisEnabled : DEFAULT_SETTINGS.linkAnalysisEnabled,
    linkAnalysisMobileEnabled:
      typeof raw.linkAnalysisMobileEnabled === "boolean" ? raw.linkAnalysisMobileEnabled : DEFAULT_SETTINGS.linkAnalysisMobileEnabled,
    linkAnalysisMaxLinks: normalizeLinkAnalysisMaxLinks(raw.linkAnalysisMaxLinks),
    linkAnalysisTimeoutMs: normalizeLinkAnalysisTimeoutMs(raw.linkAnalysisTimeoutMs),
    memoProjectTransferAfterAction,
    calloutEnabled: typeof raw.calloutEnabled === "boolean" ? raw.calloutEnabled : DEFAULT_CALLOUT_SETTINGS.calloutEnabled,
    calloutType: normalizeCalloutType(raw.calloutType),
    calloutFoldMode: normalizeCalloutFoldMode(raw.calloutFoldMode),
    calloutTitleMode: normalizeCalloutTitleMode(raw.calloutTitleMode),
    calloutTitleTemplate: normalizeTextSetting(raw.calloutTitleTemplate, DEFAULT_CALLOUT_SETTINGS.calloutTitleTemplate),
    calloutAutoForLongContent:
      typeof raw.calloutAutoForLongContent === "boolean" ? raw.calloutAutoForLongContent : DEFAULT_CALLOUT_SETTINGS.calloutAutoForLongContent,
    calloutAutoLength: normalizeCalloutThreshold(raw.calloutAutoLength, DEFAULT_CALLOUT_SETTINGS.calloutAutoLength),
    calloutAutoLines: normalizeCalloutThreshold(raw.calloutAutoLines, DEFAULT_CALLOUT_SETTINGS.calloutAutoLines),
    calloutAutoForLinks: typeof raw.calloutAutoForLinks === "boolean" ? raw.calloutAutoForLinks : DEFAULT_CALLOUT_SETTINGS.calloutAutoForLinks,
    composerToolbar: normalizeComposerToolbarSettings(raw.composerToolbar),
    clearAfterSave,
    openTargetFileAfterSend:
      typeof raw.openTargetFileAfterSend === "boolean" ? raw.openTargetFileAfterSend : DEFAULT_SETTINGS.openTargetFileAfterSend,
    sendFailureDraftEnabled: typeof raw.sendFailureDraftEnabled === "boolean" ? raw.sendFailureDraftEnabled : DEFAULT_SETTINGS.sendFailureDraftEnabled,
    sendFailureDraftContent: typeof raw.sendFailureDraftContent === "string" ? raw.sendFailureDraftContent : "",
    sortOrder: raw.sortOrder === "oldest" ? "oldest" : "newest",
    pageSize: typeof raw.pageSize === "number" ? raw.pageSize : DEFAULT_SETTINGS.pageSize,
    performanceDebugMode: typeof raw.performanceDebugMode === "boolean" ? raw.performanceDebugMode : DEFAULT_SETTINGS.performanceDebugMode,
    mobilePerformanceMode: typeof raw.mobilePerformanceMode === "boolean" ? raw.mobilePerformanceMode : DEFAULT_SETTINGS.mobilePerformanceMode,
    performanceSafeMode: typeof raw.performanceSafeMode === "boolean" ? raw.performanceSafeMode : DEFAULT_SETTINGS.performanceSafeMode,
    showArchived: typeof raw.showArchived === "boolean" ? raw.showArchived : DEFAULT_SETTINGS.showArchived,
    mobileFab: typeof raw.mobileFab === "boolean" ? raw.mobileFab : DEFAULT_SETTINGS.mobileFab,
    mobileLightHomeEnabled: typeof raw.mobileLightHomeEnabled === "boolean" ? raw.mobileLightHomeEnabled : DEFAULT_SETTINGS.mobileLightHomeEnabled,
    mobileLightHomeRecentCount: normalizeMobileLightHomeRecentCount(raw.mobileLightHomeRecentCount),
    mobileLightHomeSections: normalizeMobileLightHomeSections(raw.mobileLightHomeSections),
    mobileLightHomeShowLaterButton:
      typeof raw.mobileLightHomeShowLaterButton === "boolean" ? raw.mobileLightHomeShowLaterButton : DEFAULT_SETTINGS.mobileLightHomeShowLaterButton,
    mobileHomeLayout,
    mobileHomeCustomModules,
    homeLayout: normalizeViewLayout(raw.homeLayout, "home"),
    sidebarLayout: normalizeViewLayout(raw.sidebarLayout, "sidebar"),
    mobileLayout,
    language: raw.language === "en" ? "en" : "zh",
    defaultPrefix: typeof raw.defaultPrefix === "string" ? normalizeDefaultPrefix(raw.defaultPrefix) : DEFAULT_SETTINGS.defaultPrefix,
    allMemosIcon: normalizeTextSetting(raw.allMemosIcon, DEFAULT_SETTINGS.allMemosIcon),
    iconOverrides: normalizeIconOverrides(raw.iconOverrides),
    savedSearches,
    sidebarItems: normalizeSidebarItems(raw.sidebarItems, savedSearches),
    linkCaptureDefaultTags: normalizeTagList(raw.linkCaptureDefaultTags),
    projectTag,
    projectFolderPath,
    defaultProjectSection,
    showArchivedProjects: typeof raw.showArchivedProjects === "boolean" ? raw.showArchivedProjects : DEFAULT_SETTINGS.showArchivedProjects,
    projectSections: normalizedProjectSections,
    recentProjectPaths: normalizeRecentProjectPaths(raw.recentProjectPaths),
    sendToFileEnabled: typeof raw.sendToFileEnabled === "boolean" ? raw.sendToFileEnabled : DEFAULT_SETTINGS.sendToFileEnabled,
    sendToFileDefaultTag: normalizeFileTag(raw.sendToFileDefaultTag),
    sendToFileCommonTags: normalizeSendToFileCommonTags(raw.sendToFileCommonTags),
    projectSendTagTabs,
    projectSendTabOrder: normalizeProjectSendTabOrder(raw.projectSendTabOrder, fileTemplateTabs),
    projectSendHiddenTabs: normalizeProjectSendHiddenTabs(raw.projectSendHiddenTabs, fileTemplateTabs),
    managedTemplates,
    fileTemplateLibraryFolder: normalizeFileTemplateLibraryFolder(raw.fileTemplateLibraryFolder),
    fileTemplateLibraryDefaultFolder: normalizeFileTemplateLibraryDefaultFolder(raw.fileTemplateLibraryDefaultFolder),
    fileTemplateLibraryFavorites: normalizeFileTemplateLibraryPaths(raw.fileTemplateLibraryFavorites),
    fileTemplateLibraryRecent: normalizeFileTemplateLibraryPaths(raw.fileTemplateLibraryRecent).slice(0, 20),
    fileTemplateLibraryDefaults: normalizeFileTemplateDefaults(raw.fileTemplateLibraryDefaults),
    fileTemplateLibraryDefaultTabId,
    fileTemplateLibraryTabOrder,
    fileTemplateLibraryInteraction: normalizeFileTemplateLibraryInteraction(raw.fileTemplateLibraryInteraction),
    fileTemplateTabs,
    fileTemplateTabInteraction: normalizeFileTemplateTabInteraction(raw.fileTemplateTabInteraction, raw.enableTemplateTabDrag),
    sendToFileDefaultInsertPosition: normalizeFileInsertPosition(raw.sendToFileDefaultInsertPosition),
    sendToFileNoHeadingBehavior: normalizeNoHeadingBehavior(raw.sendToFileNoHeadingBehavior),
    recentFileTargetPaths: normalizeRecentProjectPaths(raw.recentFileTargetPaths).slice(0, 10),
    tasksFormatEnabled: typeof raw.tasksFormatEnabled === "boolean" ? raw.tasksFormatEnabled : DEFAULT_SETTINGS.tasksFormatEnabled,
    taskDefaultSection,
    taskAddCreatedDate: typeof raw.taskAddCreatedDate === "boolean" ? raw.taskAddCreatedDate : DEFAULT_SETTINGS.taskAddCreatedDate,
    taskAddProjectTag: typeof raw.taskAddProjectTag === "boolean" ? raw.taskAddProjectTag : DEFAULT_SETTINGS.taskAddProjectTag,
    taskDefaultPriority: normalizeTaskPriority(raw.taskDefaultPriority),
    taskDefaultDueDate: normalizeTaskDate(raw.taskDefaultDueDate),
    taskDefaultScheduledDate: normalizeTaskDate(raw.taskDefaultScheduledDate),
    taskDefaultRecurrence: normalizeTaskRecurrence(raw.taskDefaultRecurrence),
    taskPromptOnCreate: typeof raw.taskPromptOnCreate === "boolean" ? raw.taskPromptOnCreate : DEFAULT_SETTINGS.taskPromptOnCreate
  };
}

export class MemosPlusSettingTab extends PluginSettingTab {
  private currentSettingTab: SettingsTabId = "layout";
  private selectedLayoutSurface: DisplaySurface = "home";
  private selectedLayoutModuleId: DisplayModuleId = "quickInput";
  private draggedLayoutSurface: DisplaySurface | "" = "";
  private draggedLayoutModuleId: DisplayModuleId | "" = "";
  private settingsTabsEl: HTMLElement | null = null;
  private settingsPanelEl: HTMLElement | null = null;

  constructor(app: App, private readonly plugin: MemosPlusPlugin) {
    super(app, plugin);
  }

  display(): void {
    logMemosPlusDiagnostic("settings:display", { tab: this.currentSettingTab });
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("memos-plus-settings");
    this.renderDiagnosticExport(containerEl);
    this.settingsTabsEl = this.renderSettingsTabs(containerEl);
    this.settingsPanelEl = containerEl.createDiv({ cls: "memos-plus-settings-panel" });
    this.renderCurrentSettingsPanel();
  }

  private renderDiagnosticExport(container: HTMLElement): void {
    if (!Platform.isMobile && !this.plugin.settings.performanceDebugMode) {
      return;
    }
    const lang = this.plugin.settings.language;
    const diagnostic = container.createDiv({ cls: "memos-plus-settings-diagnostic-export" });
    new Setting(diagnostic).setName(t(lang, "command.exportDiagnosticLog")).addButton((button) => {
      button.setButtonText(t(lang, "command.exportDiagnosticLog")).onClick(async () => {
        logMemosPlusDiagnostic("settings:diagnostic-export", { source: "settings" });
        await this.plugin.exportDiagnosticLog();
      });
      });
  }

  private renderCurrentSettingsPanel(): void {
    if (!this.settingsPanelEl) {
      return;
    }
    logMemosPlusDiagnostic("settings:panel-render", { tab: this.currentSettingTab });
    this.settingsPanelEl.empty();
    this.renderActiveSettingsTab(this.settingsPanelEl);
  }

  private renderActiveSettingsTab(container: HTMLElement): void {
    switch (this.currentSettingTab) {
      case "sendRules":
        this.renderSendRulesSettings(container);
        return;
      case "inputTools":
        this.renderInputToolSettings(container);
        return;
      case "records":
        this.renderRecordSettings(container);
        return;
      case "tasks":
        this.renderTasksSettings(container);
        return;
      case "fileTemplates":
        this.renderFileTemplateLibrarySettings(container);
        return;
      case "layout":
        this.renderLayoutSettings(container);
        return;
      case "directoryFilters":
        this.renderDirectoryFilterSettings(container);
        return;
      case "display":
        this.renderLayoutSettings(container);
        return;
      case "performanceData":
        this.renderPerformanceDataSettings(container);
        return;
      case "advanced":
        this.renderAdvancedSettings(container);
        return;
      default:
        this.renderSendRulesSettings(container);
    }
  }

  private renderSettingsTabs(container: HTMLElement): HTMLElement {
    const lang = this.plugin.settings.language;
    const tabs = container.createDiv({ cls: "memos-plus-settings-tabs" });
    for (const tab of SETTINGS_TABS) {
      this.renderSettingsTabButton(tabs, tab, lang);
    }
    return tabs;
  }

  private renderSettingsTabButton(
    container: HTMLElement,
    tab: { id: SettingsTabId; labelKey: string },
    lang: Language
  ): void {
    const button = container.createEl("button", {
      cls: `memos-plus-settings-tab${tab.id === this.currentSettingTab ? " is-active" : ""}`,
      text: t(lang, tab.labelKey),
      attr: { type: "button", "aria-pressed": String(tab.id === this.currentSettingTab) }
    });
    button.dataset.settingsTabId = tab.id;
    button.addEventListener("click", () => {
      this.switchSettingsTab(tab.id, button);
    });
  }

  private switchSettingsTab(tabId: SettingsTabId, selectedButton?: HTMLElement): void {
    const tabs = this.settingsTabsEl;
    const previousScrollLeft = tabs?.scrollLeft ?? 0;
    this.currentSettingTab = tabId;
    this.updateSettingsTabButtons();
    this.renderCurrentSettingsPanel();
    if (tabs) {
      restoreSettingsTabsScroll(tabs, previousScrollLeft, selectedButton ?? this.findSettingsTabButton(tabId));
    }
  }

  private updateSettingsTabButtons(): void {
    if (!this.settingsTabsEl) {
      return;
    }
    for (const button of Array.from(this.settingsTabsEl.querySelectorAll<HTMLElement>(".memos-plus-settings-tab"))) {
      const isActive = button.dataset.settingsTabId === this.currentSettingTab;
      button.toggleClass("is-active", isActive);
      button.setAttr("aria-pressed", String(isActive));
    }
  }

  private findSettingsTabButton(tabId: SettingsTabId): HTMLElement | null {
    return this.settingsTabsEl?.querySelector<HTMLElement>(`.memos-plus-settings-tab[data-settings-tab-id="${tabId}"]`) ?? null;
  }

  private renderSectionHeader(container: HTMLElement, titleKey: string, descKey?: string): void {
    const lang = this.plugin.settings.language;
    container.createEl("h3", { cls: "memos-plus-settings-section-title", text: t(lang, titleKey) });
    if (descKey) {
      container.createEl("p", {
        cls: "setting-item-description memos-plus-settings-section-desc",
        text: t(lang, descKey)
      });
    }
  }

  private renderSettingsDetails(container: HTMLElement, titleKey: string, descKey?: string): HTMLDetailsElement {
    const lang = this.plugin.settings.language;
    const details = container.createEl("details", { cls: "memos-plus-settings-advanced-details" });
    details.createEl("summary", { text: t(lang, titleKey) });
    if (descKey) {
      details.createEl("p", {
        cls: "setting-item-description memos-plus-settings-section-desc",
        text: t(lang, descKey)
      });
    }
    return details;
  }

  private renderSendRulesSettings(container: HTMLElement): void {
    this.renderSectionHeader(container, "settings.sendRulesSettings", "settings.sendRulesSettingsDesc");
    this.renderTemplateManagementSettings(container);
    this.renderSendToFileSettings(container);
    this.renderProjectSendTabSettings(container);
  }

  private renderTemplateManagementSettings(container: HTMLElement): void {
    this.renderManagedTemplateSettings(container);
  }

  private renderRecordSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.sendWriteSettings", "settings.sendWriteSettingsDesc");
    new Setting(container)
      .setName(t(lang, "settings.folderPath"))
      .setDesc(t(lang, "settings.folderPathDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_MEMO_FOLDER)
          .setValue(this.plugin.settings.memoFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.memoFolderPath = normalizePath(value.trim() || DEFAULT_MEMO_FOLDER);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.defaultPrefix"))
      .setDesc(t(lang, "settings.defaultPrefixDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", t(lang, "prefix.none"))
          .addOption("list", t(lang, "prefix.list"))
          .addOption("task", t(lang, "prefix.task"))
          .setValue(this.plugin.settings.defaultPrefix)
          .onChange(async (value) => {
            this.plugin.settings.defaultPrefix = normalizeDefaultPrefix(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.defaultSendAction"))
      .setDesc(t(lang, "settings.defaultSendActionDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("memo", t(lang, "sendAction.memo"))
          .addOption("project", t(lang, "sendAction.project"))
          .addOption("ask", t(lang, "sendAction.ask"))
          .setValue(this.plugin.settings.defaultSendAction)
          .onChange(async (value) => {
            this.plugin.settings.defaultSendAction = normalizeDefaultSendAction(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.clearAfterSave"))
      .setDesc(t(lang, "settings.clearAfterSaveDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.clearAfterSave).onChange(async (value) => {
          this.plugin.settings.clearAfterSave = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.openTargetFileAfterSend"))
      .setDesc(t(lang, "settings.openTargetFileAfterSendDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.openTargetFileAfterSend).onChange(async (value) => {
          this.plugin.settings.openTargetFileAfterSend = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.sendFailureDraftEnabled"))
      .setDesc(t(lang, "settings.sendFailureDraftEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.sendFailureDraftEnabled).onChange(async (value) => {
          this.plugin.settings.sendFailureDraftEnabled = value;
          if (!value) {
            this.plugin.settings.sendFailureDraftContent = "";
          }
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.linkCaptureDefaultTags"))
      .setDesc(t(lang, "settings.linkCaptureDefaultTagsDesc"))
      .addText((text) => {
        text
          .setPlaceholder("链接 收集")
          .setValue(formatTagsForInput(this.plugin.settings.linkCaptureDefaultTags))
          .onChange(async (value) => {
            this.plugin.settings.linkCaptureDefaultTags = normalizeTagList(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.memoProjectTransferAfterAction"))
      .setDesc(t(lang, "settings.memoProjectTransferAfterActionDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("keep", t(lang, "memoProjectTransfer.keep"))
          .addOption("archive", t(lang, "memoProjectTransfer.archive"))
          .addOption("delete", t(lang, "memoProjectTransfer.delete"))
          .setValue(this.plugin.settings.memoProjectTransferAfterAction)
          .onChange(async (value) => {
            this.plugin.settings.memoProjectTransferAfterAction = normalizeMemoProjectTransferAfterAction(value);
            await this.plugin.persistSettings();
          });
      });
    this.renderProjectWriteSettings(container);
    this.renderManagedTemplateSettings(container);
    this.renderSendToFileSettings(container);
    this.renderProjectSendTabSettings(container);
  }

  private renderProjectWriteSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.projectWriteSettings", "settings.projectWriteSettingsDesc");
    new Setting(container)
      .setName(t(lang, "settings.projectTag"))
      .setDesc(t(lang, "settings.projectTagDesc"))
      .addText((text) => {
        text
          .setPlaceholder("项目")
          .setValue(this.plugin.settings.projectTag)
          .onChange(async (value) => {
            this.plugin.settings.projectTag = normalizeProjectTag(value) || DEFAULT_SETTINGS.projectTag;
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.projectFolderPath"))
      .setDesc(t(lang, "settings.projectFolderPathDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_PROJECT_FOLDER)
          .setValue(this.plugin.settings.projectFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.projectFolderPath = normalizeVaultPath(value, DEFAULT_PROJECT_FOLDER);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.defaultProjectSection"))
      .setDesc(t(lang, "settings.defaultProjectSectionDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.defaultProjectSection)
          .setValue(this.plugin.settings.defaultProjectSection)
          .onChange(async (value) => {
            const section = normalizeTextSetting(value, DEFAULT_SETTINGS.defaultProjectSection);
            this.plugin.settings.defaultProjectSection = section;
            if (!this.plugin.settings.projectSections.includes(section)) {
              this.plugin.settings.projectSections = [section, ...this.plugin.settings.projectSections].filter(uniqueNonEmpty);
            }
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.showArchivedProjects"))
      .setDesc(t(lang, "settings.showArchivedProjectsDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showArchivedProjects).onChange(async (value) => {
          this.plugin.settings.showArchivedProjects = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.projectSections"))
      .setDesc(t(lang, "settings.projectSectionsDesc"))
      .addTextArea((text) => {
        text
          .setPlaceholder(DEFAULT_PROJECT_SECTIONS.join("\n"))
          .setValue(this.plugin.settings.projectSections.join("\n"))
          .onChange(async (value) => {
            const sections = normalizeProjectSections(value);
            const defaultSection = normalizeTextSetting(this.plugin.settings.defaultProjectSection, DEFAULT_SETTINGS.defaultProjectSection);
            this.plugin.settings.projectSections = sections.includes(defaultSection)
              ? sections
              : [defaultSection, ...sections].filter(uniqueNonEmpty);
            await this.plugin.persistSettings();
          });
        text.inputEl.rows = 6;
      });
  }

  private renderDisplaySettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.displaySettings", "settings.displaySettingsDesc");
    this.renderLanguageSetting(container);
    this.renderComposerAppearanceSettings(container);
    this.renderMobileDisplaySettings(container);
    new Setting(container)
      .setName(t(lang, "settings.sortOrder"))
      .setDesc(t(lang, "settings.sortOrderDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("newest", t(lang, "sort.newest"))
          .addOption("oldest", t(lang, "sort.oldest"))
          .setValue(this.plugin.settings.sortOrder)
          .onChange(async (value) => {
            this.plugin.settings.sortOrder = value === "oldest" ? "oldest" : "newest";
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.pageSize"))
      .setDesc(t(lang, "settings.pageSizeDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(20, 200, 10)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.pageSize)
          .onChange(async (value) => {
            this.plugin.settings.pageSize = value;
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.showArchived"))
      .setDesc(t(lang, "settings.showArchivedDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showArchived).onChange(async (value) => {
          this.plugin.settings.showArchived = value;
          await this.plugin.persistSettings();
        });
      });
  }

  private renderLanguageSetting(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    new Setting(container)
      .setName(t(lang, "settings.language"))
      .setDesc(t(lang, "settings.languageDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value === "en" ? "en" : "zh";
            await this.plugin.persistSettings();
            this.display();
          });
      });
  }

  private renderMobileDisplaySettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.mobileDisplaySettings", "settings.mobileDisplaySettingsDesc");
    new Setting(container)
      .setName(t(lang, "settings.mobileFab"))
      .setDesc(t(lang, "settings.mobileFabDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.mobileFab).onChange(async (value) => {
          this.plugin.settings.mobileFab = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.mobileLightHomeEnabled"))
      .setDesc(t(lang, "settings.mobileLightHomeEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.mobileLightHomeEnabled).onChange(async (value) => {
          this.plugin.settings.mobileLightHomeEnabled = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.mobileLightHomeShowLaterButton"))
      .setDesc(t(lang, "settings.mobileLightHomeShowLaterButtonDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.mobileLightHomeShowLaterButton).onChange(async (value) => {
          this.plugin.settings.mobileLightHomeShowLaterButton = value;
          await this.plugin.persistSettings();
        });
      });
  }

  private renderLayoutSettings(container: HTMLElement): void {
    this.renderSectionHeader(container, "settings.layoutSettings", "settings.layoutSettingsDesc");
    const switcher = container.createDiv({ cls: "memos-plus-layout-surface-switcher" });
    const workspace = container.createDiv();
    this.renderLayoutSurfaceSwitcher(switcher, workspace);
    this.renderLayoutVisualWorkspace(workspace, this.selectedLayoutSurface);

    this.renderSectionHeader(container, "settings.displayContentSync", "settings.displayContentSyncDesc");
    this.renderDisplayContentSyncSettings(container);
    this.renderDisplaySettings(container);
  }

  private renderLayoutSurfaceSwitcher(container: HTMLElement, workspace: HTMLElement): void {
    const lang = this.plugin.settings.language;
    for (const surface of DISPLAY_SURFACES) {
      const button = container.createEl("button", {
        cls: `memos-plus-layout-surface-button${surface === this.selectedLayoutSurface ? " is-active" : ""}`,
        text: t(lang, `settings.layoutDesigner.surface.${surface}`),
        attr: { type: "button" }
      });
      button.addEventListener("click", () => {
        this.selectedLayoutSurface = surface;
        this.selectedLayoutModuleId = this.getSelectedLayoutModule(surface).id;
        for (const child of Array.from(container.children)) {
          child.toggleClass("is-active", child === button);
        }
        workspace.empty();
        this.renderLayoutVisualWorkspace(workspace, surface);
      });
    }
  }

  private renderLayoutVisualWorkspace(container: HTMLElement, surface: DisplaySurface): void {
    const layout = this.getViewLayout(surface);
    const designer = container.createDiv({ cls: "memos-plus-layout-designer" });
    const previewWrap = designer.createDiv({ cls: "memos-plus-layout-preview-wrap" });
    previewWrap.createEl("div", { cls: "memos-plus-layout-pane-title", text: t(this.plugin.settings.language, "settings.layoutDesigner.preview") });
    const preview = previewWrap.createDiv({ cls: `memos-plus-layout-preview memos-plus-layout-preview-${surface}` });

    const inspector = designer.createDiv({ cls: "memos-plus-layout-inspector" });
    this.renderLayoutModeControl(previewWrap, surface, preview, inspector);
    this.renderLayoutPreview(preview, surface, inspector);
    this.renderLayoutModuleInspector(inspector, surface, this.getSelectedLayoutModule(surface).id, preview);

    if (layout.mode !== "custom") {
      previewWrap.createEl("p", {
        cls: "setting-item-description memos-plus-layout-preset-note",
        text: t(this.plugin.settings.language, "settings.layoutDesigner.presetNote")
      });
    }
  }

  private renderLayoutModeControl(container: HTMLElement, surface: DisplaySurface, preview: HTMLElement, inspector: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const layout = this.getViewLayout(surface);
    new Setting(container)
      .setClass("memos-plus-layout-mode-setting")
      .setName(t(lang, "settings.displayContentMode"))
      .setDesc(t(lang, "settings.displayContentModeDesc"))
      .addDropdown((dropdown) => {
        for (const mode of DISPLAY_LAYOUT_MODES) {
          dropdown.addOption(mode, t(lang, `settings.displayLayoutMode.${mode}`));
        }
        dropdown.setValue(layout.mode).onChange(async (value) => {
          const current = this.getViewLayout(surface);
          await this.setViewLayout(surface, normalizeViewLayout({ mode: value, compactMode: current.compactMode }, surface));
          preview.empty();
          inspector.empty();
          this.selectedLayoutModuleId = this.getSelectedLayoutModule(surface).id;
          this.renderLayoutPreview(preview, surface, inspector);
          this.renderLayoutModuleInspector(inspector, surface, this.selectedLayoutModuleId, preview);
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.displayContentCompactMode"))
      .setDesc(t(lang, "settings.displayContentCompactModeDesc"))
      .addToggle((toggle) => {
        toggle.setValue(layout.compactMode).onChange(async (value) => {
          const current = this.getViewLayout(surface);
          await this.setViewLayout(
            surface,
            normalizeViewLayout(
              {
                mode: current.mode,
                visibleModules: current.visibleModules,
                order: current.order,
                compactMode: value
              },
              surface
            )
          );
        });
      });
  }

  private renderLayoutPreview(container: HTMLElement, surface: DisplaySurface, inspector: HTMLElement): void {
    const mockup = container.createDiv({ cls: `memos-plus-layout-mockup memos-plus-layout-mockup-${surface}` });
    if (Platform.isMobile) {
      this.renderMobileLayoutModuleList(mockup, container, surface, inspector);
      return;
    }
    if (surface === "sidebar") {
      this.renderSidebarLayoutMockup(mockup, container, inspector);
      return;
    }
    if (surface === "mobile") {
      this.renderMobileLayoutMockup(mockup, container, inspector);
      return;
    }
    this.renderHomeLayoutMockup(mockup, container, inspector);
  }

  private renderMobileLayoutModuleList(container: HTMLElement, preview: HTMLElement, surface: DisplaySurface, inspector: HTMLElement): void {
    const lang = this.plugin.settings.language;
    container.createEl("p", {
      cls: "setting-item-description memos-plus-layout-mobile-list-hint",
      text: t(lang, "settings.layoutDesigner.mobileListHint")
    });
    const list = container.createDiv({ cls: "memos-plus-layout-mobile-list" });
    for (const moduleId of this.orderedPreviewModules(surface, modulesForSurface(surface).map((module) => module.id))) {
      const module = getDisplayModule(moduleId);
      if (!module) {
        continue;
      }
      const visible = this.isDisplayModuleVisible(surface, module.id);
      const row = list.createDiv({
        cls: `memos-plus-layout-mobile-row${visible ? "" : " is-hidden"}${this.getSelectedLayoutModule(surface).id === module.id ? " is-selected" : ""}`
      });
      const label = row.createEl("button", {
        cls: "memos-plus-layout-mobile-row-label",
        text: module.name,
        attr: { type: "button" }
      });
      label.addEventListener("click", async () => {
        if (!visible) {
          await this.setDisplayModuleVisible(surface, module.id, true);
        }
        this.selectLayoutModule(surface, module.id, preview, inspector);
      });
      const controls = row.createDiv({ cls: "memos-plus-layout-mobile-row-controls" });
      const visibility = controls.createEl("input", { type: "checkbox" });
      visibility.checked = visible;
      visibility.addEventListener("change", async () => {
        await this.setDisplayModuleVisible(surface, module.id, visibility.checked);
        preview.empty();
        inspector.empty();
        this.renderLayoutPreview(preview, surface, inspector);
        this.renderLayoutModuleInspector(inspector, surface, module.id, preview);
      });
      const moveUp = controls.createEl("button", {
        text: t(lang, "settings.layoutDesigner.moveUp"),
        attr: { type: "button" }
      });
      moveUp.disabled = !visible || !this.canMoveLayoutModule(surface, module.id, -1);
      moveUp.addEventListener("click", async () => {
        await this.moveLayoutModule(surface, module.id, -1);
        this.selectLayoutModule(surface, module.id, preview, inspector);
      });
      const moveDown = controls.createEl("button", {
        text: t(lang, "settings.layoutDesigner.moveDown"),
        attr: { type: "button" }
      });
      moveDown.disabled = !visible || !this.canMoveLayoutModule(surface, module.id, 1);
      moveDown.addEventListener("click", async () => {
        await this.moveLayoutModule(surface, module.id, 1);
        this.selectLayoutModule(surface, module.id, preview, inspector);
      });
    }
  }

  private renderHomeLayoutMockup(container: HTMLElement, preview: HTMLElement, inspector: HTMLElement): void {
    const top = container.createDiv({ cls: "memos-plus-layout-home-topbar" });
    this.renderLayoutPreviewRegionsInOrder(
      top,
      preview,
      "home",
      HOME_TOOLBAR_LAYOUT_GROUP,
      {
        searchBox: { label: "搜索区", variant: "pill" },
        settingsButton: { label: "设置", variant: "icon" },
        refreshButton: { label: "刷新", variant: "icon" }
      },
      inspector
    );

    const shell = container.createDiv({ cls: "memos-plus-layout-home-shell" });
    const sidebar = shell.createDiv({ cls: "memos-plus-layout-home-sidebar" });
    const main = shell.createDiv({ cls: "memos-plus-layout-home-main" });
    this.renderOrderedLayoutPreview(shell, preview, "home", HOME_PREVIEW_LAYOUT_GROUPS, ["sidebar", "composer", "results"], (regionId, moduleIds) => {
      if (regionId === "sidebar") {
        this.renderLayoutPreviewRegionsInOrder(
          sidebar,
          preview,
          "home",
          moduleIds,
          {
            allNotes: { label: "全部笔记", variant: "nav" },
            projectDirectory: { label: "项目", variant: "nav" },
            projectFilters: { label: "所有项目 / 软件项目", variant: "nav" },
            organizeDirectory: { label: "任务管理", variant: "nav" },
            taskDirectory: { label: "任务", variant: "nav" },
            tagFilters: { label: "标签", variant: "nav" },
            statsCards: { label: "统计卡片", variant: "panel" },
            heatmap: { label: "热力图", variant: "heatmap" }
          },
          inspector
        );
        return;
      }
      if (regionId === "composer") {
        const composer = main.createDiv({ cls: "memos-plus-layout-home-composer" });
        this.renderLayoutPreviewRegionsInOrder(
          composer,
          preview,
          "home",
          moduleIds,
          {
            quickInput: { label: "快速输入", variant: "large" },
            inputToolbar: { label: "工具栏", variant: "chip" },
            moreMenu: { label: "更多", variant: "chip" },
            sendButton: { label: "发送", variant: "send" }
          },
          inspector
        );
        return;
      }
      if (regionId === "results") {
        this.renderLayoutPreviewRegionsInOrder(
          main,
          preview,
          "home",
          moduleIds,
          {
            fileCount: { label: "18 文件 · 所有项目", variant: "meta" },
            fileList: { label: "文件列表", variant: "cards" }
          },
          inspector
        );
      }
    });
  }

  private renderSidebarLayoutMockup(container: HTMLElement, preview: HTMLElement, inspector: HTMLElement): void {
    const card = container.createDiv({ cls: "memos-plus-layout-sidebar-card" });
    this.renderOrderedLayoutPreview(card, preview, "sidebar", SIDEBAR_PREVIEW_LAYOUT_GROUPS, ["headerActions", "composer", "directory", "results"], (regionId, moduleIds) => {
      if (regionId === "headerActions") {
        const header = card.createDiv({ cls: "memos-plus-layout-sidebar-header" });
        const titleWrap = header.createDiv();
        titleWrap.createDiv({ cls: "memos-plus-layout-mini-title", text: "Memos Plus 快速输入" });
        titleWrap.createDiv({ cls: "memos-plus-layout-mini-subtitle", text: "发送到项目" });
        const headerActions = header.createDiv({ cls: "memos-plus-layout-mini-actions" });
        this.renderLayoutPreviewRegionsInOrder(
          headerActions,
          preview,
          "sidebar",
          moduleIds,
          {
            settingsButton: { label: "设置", variant: "icon" },
            refreshButton: { label: "刷新", variant: "icon" }
          },
          inspector
        );
        return;
      }
      if (regionId === "composer") {
        const composer = card.createDiv({ cls: "memos-plus-layout-sidebar-composer" });
        this.renderLayoutPreviewRegionsInOrder(
          composer,
          preview,
          "sidebar",
          moduleIds,
          {
            quickInput: { label: "快速输入", variant: "large" },
            inputToolbar: { label: "# 图片 任务", variant: "chip" },
            moreMenu: { label: "更多", variant: "chip" },
            sendButton: { label: "发送", variant: "send" }
          },
          inspector
        );
        return;
      }
      if (regionId === "directory") {
        const directory = card.createDiv({ cls: "memos-plus-layout-sidebar-directory" });
        const directoryHead = directory.createDiv({ cls: "memos-plus-layout-directory-title" });
        directoryHead.createSpan({ text: "目录" });
        directoryHead.createSpan({ text: "+" });
        this.renderLayoutPreviewRegionsInOrder(
          directory,
          preview,
          "sidebar",
          moduleIds,
          {
            allNotes: { label: "全部笔记 32", variant: "nav" },
            projectDirectory: { label: "项目", variant: "nav" },
            projectFilters: { label: "所有项目 / 软件项目", variant: "nav" },
            organizeDirectory: { label: "任务管理", variant: "nav" },
            taskDirectory: { label: "任务", variant: "nav" },
            tagFilters: { label: "标签", variant: "nav" }
          },
          inspector
        );
        return;
      }
      if (regionId === "results") {
        const results = card.createDiv({ cls: "memos-plus-layout-sidebar-results" });
        this.renderLayoutPreviewRegionsInOrder(
          results,
          preview,
          "sidebar",
          moduleIds,
          {
            fileCount: { label: "18 文件 · 项目", variant: "meta" },
            fileList: { label: "文件卡片列表", variant: "cards" }
          },
          inspector
        );
      }
    });
  }

  private renderMobileLayoutMockup(container: HTMLElement, preview: HTMLElement, inspector: HTMLElement): void {
    const phone = container.createDiv({ cls: "memos-plus-layout-phone-frame" });
    const screen = phone.createDiv({ cls: "memos-plus-layout-phone-screen" });
    this.renderOrderedLayoutPreview(screen, preview, "mobile", MOBILE_PREVIEW_LAYOUT_GROUPS, ["composer", "toolbar", "navigation", "results"], (regionId, moduleIds) => {
      if (regionId === "composer") {
        const top = screen.createDiv({ cls: "memos-plus-layout-mobile-top" });
        this.renderLayoutPreviewRegionsInOrder(
          top,
          preview,
          "mobile",
          moduleIds,
          {
            quickInput: { label: "快速输入", variant: "large" },
            inputToolbar: { label: "工具栏", variant: "chip" },
            moreMenu: { label: "更多", variant: "chip" },
            sendButton: { label: "发送", variant: "send" }
          },
          inspector
        );
        return;
      }
      if (regionId === "toolbar") {
        const nav = screen.createDiv({ cls: "memos-plus-layout-mobile-nav" });
        this.renderLayoutPreviewRegionsInOrder(
          nav,
          preview,
          "mobile",
          moduleIds,
          {
            searchBox: { label: "搜索", variant: "pill" },
            settingsButton: { label: "设置", variant: "icon" },
            refreshButton: { label: "刷新", variant: "icon" }
          },
          inspector
        );
        return;
      }
      if (regionId === "navigation") {
        const directory = screen.createDiv({ cls: "memos-plus-layout-mobile-directory" });
        this.renderLayoutPreviewRegionsInOrder(
          directory,
          preview,
          "mobile",
          moduleIds,
          {
            allNotes: { label: "全部笔记", variant: "nav" },
            projectDirectory: { label: "项目", variant: "nav" },
            projectFilters: { label: "项目筛选", variant: "nav" },
            organizeDirectory: { label: "任务管理", variant: "nav" },
            taskDirectory: { label: "任务", variant: "nav" },
            tagFilters: { label: "标签", variant: "nav" },
            statsCards: { label: "统计", variant: "panel" },
            heatmap: { label: "热力图", variant: "heatmap" }
          },
          inspector
        );
        return;
      }
      if (regionId === "results") {
        const content = screen.createDiv({ cls: "memos-plus-layout-mobile-content" });
        this.renderLayoutPreviewRegionsInOrder(
          content,
          preview,
          "mobile",
          moduleIds,
          {
            fileCount: { label: "最近 10 条", variant: "meta" },
            fileList: { label: "最近笔记", variant: "cards" }
          },
          inspector
        );
      }
    });
  }

  private renderOrderedLayoutPreview(
    container: HTMLElement,
    preview: HTMLElement,
    surface: DisplaySurface,
    groups: Record<string, readonly DisplayModuleId[]>,
    fallbackRegionOrder: readonly string[],
    renderRegion: (regionId: string, moduleIds: readonly DisplayModuleId[]) => void
  ): void {
    const orderedModules = resolveLayoutSurfaceModules(this.getViewLayout(surface), surface).orderedModules;
    const orderedRegions = orderedLayoutRegions(orderedModules, groups)
      .map((region) => region.regionId)
      .filter((regionId) => Object.prototype.hasOwnProperty.call(groups, regionId));
    const regionIds = [...orderedRegions, ...fallbackRegionOrder.filter((regionId) => !orderedRegions.includes(regionId))];
    for (const regionId of regionIds) {
      renderRegion(regionId, groups[regionId] ?? []);
    }
  }

  private renderLayoutPreviewRegionsInOrder(
    container: HTMLElement,
    preview: HTMLElement,
    surface: DisplaySurface,
    moduleIds: readonly DisplayModuleId[],
    labels: Partial<Record<DisplayModuleId, { label: string; variant?: string }>>,
    inspector: HTMLElement
  ): void {
    for (const moduleId of this.orderedPreviewModules(surface, moduleIds)) {
      const config = labels[moduleId];
      if (!config) {
        continue;
      }
      this.renderLayoutPreviewRegion(container, preview, surface, moduleId, config.label, inspector, config.variant);
    }
  }

  private orderedPreviewModules(surface: DisplaySurface, moduleIds: readonly DisplayModuleId[]): DisplayModuleId[] {
    const supportedModules = moduleIds.filter((moduleId) => getDisplayModule(moduleId)?.supportedSurfaces.includes(surface));
    const visibleModules = orderedModulesInGroup(resolveLayoutSurfaceModules(this.getViewLayout(surface), surface).orderedModules, supportedModules);
    const visible = new Set(visibleModules);
    return [...visibleModules, ...supportedModules.filter((moduleId) => !visible.has(moduleId))];
  }

  private renderLayoutPreviewRegion(
    container: HTMLElement,
    preview: HTMLElement,
    surface: DisplaySurface,
    moduleId: DisplayModuleId,
    label: string,
    inspector: HTMLElement,
    variant = "default"
  ): void {
    const module = getDisplayModule(moduleId);
    if (!module || !module.supportedSurfaces.includes(surface)) {
      return;
    }
    const visible = this.isDisplayModuleVisible(surface, module.id);
    const button = container.createEl("button", {
      cls: [
        "memos-plus-layout-region",
        `memos-plus-layout-region-${variant}`,
        `memos-plus-layout-module-${module.id}`,
        this.getSelectedLayoutModule(surface).id === module.id ? "is-selected" : "",
        visible ? "" : "is-hidden"
      ]
        .filter(Boolean)
        .join(" "),
      attr: { type: "button" }
    });
    button.createEl("span", { cls: "memos-plus-layout-region-label", text: label });
    button.addEventListener("click", async () => {
      if (!visible) {
        await this.setDisplayModuleVisible(surface, module.id, true);
      }
      this.selectLayoutModule(surface, module.id, preview, inspector);
    });
    if (!Platform.isMobile && visible) {
      button.setAttr("draggable", "true");
      button.addEventListener("dragstart", (event) => {
        this.draggedLayoutSurface = surface;
        this.draggedLayoutModuleId = module.id;
        button.addClass("is-dragging");
        event.dataTransfer?.setData("text/plain", module.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });
      button.addEventListener("dragend", () => {
        this.clearLayoutPreviewDragState(preview);
      });
      button.addEventListener("dragover", (event) => {
        if (!this.canDropLayoutPreviewModule(surface, module.id)) {
          return;
        }
        event.preventDefault();
        button.addClass("is-drop-target");
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });
      button.addEventListener("dragleave", () => {
        button.removeClass("is-drop-target");
      });
      button.addEventListener("drop", async (event) => {
        await this.dropLayoutPreviewModule(event, surface, module.id, preview, inspector);
      });
    }
  }

  private canDropLayoutPreviewModule(surface: DisplaySurface, targetModuleId: DisplayModuleId): boolean {
    return this.draggedLayoutSurface === surface && this.draggedLayoutModuleId !== "" && this.draggedLayoutModuleId !== targetModuleId;
  }

  private async dropLayoutPreviewModule(
    event: DragEvent,
    surface: DisplaySurface,
    targetModuleId: DisplayModuleId,
    preview: HTMLElement,
    inspector: HTMLElement
  ): Promise<void> {
    if (!this.canDropLayoutPreviewModule(surface, targetModuleId)) {
      this.clearLayoutPreviewDragState(preview);
      return;
    }
    event.preventDefault();
    const sourceModuleId = this.draggedLayoutModuleId;
    if (sourceModuleId === "") {
      this.clearLayoutPreviewDragState(preview);
      return;
    }
    await this.moveLayoutModuleBefore(surface, sourceModuleId, targetModuleId);
    this.clearLayoutPreviewDragState(preview);
    this.selectLayoutModule(surface, sourceModuleId, preview, inspector);
  }

  private clearLayoutPreviewDragState(preview: HTMLElement): void {
    this.draggedLayoutSurface = "";
    this.draggedLayoutModuleId = "";
    for (const element of Array.from(preview.querySelectorAll<HTMLElement>(".memos-plus-layout-region"))) {
      element.removeClass("is-dragging");
      element.removeClass("is-drop-target");
    }
  }

  private selectLayoutModule(surface: DisplaySurface, moduleId: DisplayModuleId, preview: HTMLElement, inspector: HTMLElement): void {
    this.selectedLayoutSurface = surface;
    this.selectedLayoutModuleId = moduleId;
    preview.empty();
    this.renderLayoutPreview(preview, surface, inspector);
    inspector.empty();
    this.renderLayoutModuleInspector(inspector, surface, moduleId, preview);
  }

  private renderLayoutModuleInspector(container: HTMLElement, surface: DisplaySurface, moduleId: DisplayModuleId, preview: HTMLElement): void {
    const module = getDisplayModule(moduleId) ?? this.getSelectedLayoutModule(surface);
    const lang = this.plugin.settings.language;
    container.createEl("div", { cls: "memos-plus-layout-pane-title", text: t(lang, "settings.layoutDesigner.inspector") });
    container.createEl("h4", { cls: "memos-plus-layout-inspector-title", text: module.name });
    container.createEl("p", { cls: "setting-item-description memos-plus-layout-inspector-desc", text: module.description });

    switch (module.id) {
      case "taskDirectory":
        this.renderLayoutTaskDirectoryInspector(container, surface, module, preview);
        break;
      case "quickInput":
        this.renderLayoutQuickInputInspector(container, surface, module, preview);
        break;
      case "inputToolbar":
      case "sendButton":
      case "moreMenu":
        this.renderLayoutComposerPartInspector(container, surface, module, preview);
        break;
      case "organizeDirectory":
        this.renderLayoutOrganizerInspector(container, surface, module, preview);
        break;
      default:
        this.renderLayoutGenericInspector(container, surface, module, preview);
        break;
    }
  }

  private renderLayoutGenericInspector(container: HTMLElement, surface: DisplaySurface, module: DisplayModuleDefinition, preview: HTMLElement): void {
    this.renderModuleVisibilitySetting(container, surface, module, preview);
    this.renderLayoutInspectorActions(container, surface, module, preview);
  }

  private renderLayoutQuickInputInspector(container: HTMLElement, surface: DisplaySurface, module: DisplayModuleDefinition, preview: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderModuleVisibilitySetting(container, surface, module, preview);
    this.renderLinkedModuleVisibilitySetting(container, surface, "inputToolbar", "settings.layoutDesigner.showToolbar", preview);
    this.renderLinkedModuleVisibilitySetting(container, surface, "sendButton", "settings.layoutDesigner.showSendButton", preview);
    if (surface === "sidebar") {
      this.renderQuickInputStartupCard(container, "settings.quickInputStartupInspectorDesc");
    }

    new Setting(container)
      .setName(t(lang, surface === "sidebar" ? "settings.quickInputDefaultSendAction" : "settings.defaultSendAction"))
      .setDesc(t(lang, surface === "sidebar" ? "settings.quickInputDefaultSendActionDesc" : "settings.defaultSendActionDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("memo", t(lang, "sendAction.memo"))
          .addOption("project", t(lang, "sendAction.project"))
          .addOption("ask", t(lang, "sendAction.ask"))
          .setValue(surface === "sidebar" ? this.plugin.settings.quickInputDefaultSendAction : this.plugin.settings.defaultSendAction)
          .onChange(async (value) => {
            if (surface === "sidebar") {
              this.plugin.settings.quickInputDefaultSendAction = normalizeQuickInputSendAction(value);
            } else {
              this.plugin.settings.defaultSendAction = normalizeDefaultSendAction(value);
            }
            await this.persistLayoutAffectingSetting();
          });
      });

    if (surface === "sidebar") {
      new Setting(container)
        .setName(t(lang, "settings.quickInputShowDirectory"))
        .setDesc(t(lang, "settings.quickInputShowDirectoryDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.quickInputShowDirectory).onChange(async (value) => {
            this.plugin.settings.quickInputShowDirectory = value;
            await this.persistLayoutAffectingSetting();
          });
        });
    }
    this.renderLayoutInspectorHint(container, "settings.layoutDesigner.quickInputHint");
    this.renderLayoutInspectorActions(container, surface, module, preview, "inputTools");
  }

  private renderLayoutComposerPartInspector(container: HTMLElement, surface: DisplaySurface, module: DisplayModuleDefinition, preview: HTMLElement): void {
    this.renderModuleVisibilitySetting(container, surface, module, preview);
    if (module.id === "inputToolbar") {
      this.renderLayoutInspectorHint(container, "settings.layoutDesigner.toolbarHint");
    }
    this.renderLayoutInspectorActions(container, surface, module, preview, "inputTools");
  }

  private renderLayoutOrganizerInspector(container: HTMLElement, surface: DisplaySurface, module: DisplayModuleDefinition, preview: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderModuleVisibilitySetting(container, surface, module, preview);
    new Setting(container)
      .setName(t(lang, "settings.organizerPanelEnabled"))
      .setDesc(t(lang, "settings.organizerPanelEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerPanelEnabled).onChange(async (value) => {
          this.plugin.settings.organizerPanelEnabled = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    this.renderLayoutInspectorActions(container, surface, module, preview, "directoryFilters");
  }

  private renderLayoutTaskDirectoryInspector(container: HTMLElement, surface: DisplaySurface, module: DisplayModuleDefinition, preview: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderModuleVisibilitySetting(container, surface, module, preview);
    new Setting(container)
      .setName(t(lang, "settings.organizerTasksDefaultExpanded"))
      .setDesc(t(lang, "settings.organizerTasksDefaultExpandedDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerTasksDefaultExpanded).onChange(async (value) => {
          this.plugin.settings.organizerTasksDefaultExpanded = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.organizerTaskPriorityBranchesEnabled"))
      .setDesc(t(lang, "settings.organizerTaskPriorityBranchesEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerTaskPriorityBranchesEnabled).onChange(async (value) => {
          this.plugin.settings.organizerTaskPriorityBranchesEnabled = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.organizerTaskDateBranchesEnabled"))
      .setDesc(t(lang, "settings.organizerTaskDateBranchesEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerTaskDateBranchesEnabled).onChange(async (value) => {
          this.plugin.settings.organizerTaskDateBranchesEnabled = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskVaultFilterEnabled"))
      .setDesc(t(lang, "settings.taskVaultFilterEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskVaultFilterEnabled).onChange(async (value) => {
          this.plugin.settings.taskVaultFilterEnabled = value;
          await this.persistLayoutAffectingSetting();
          if (value && this.plugin.settings.taskIndexEnabled) {
            this.plugin.taskIndex.scheduleBuild(0);
          }
        });
      });
    this.renderLayoutInspectorHint(container, "settings.layoutDesigner.countHint");
    this.renderLayoutInspectorActions(container, surface, module, preview, "directoryFilters");
  }

  private renderModuleVisibilitySetting(container: HTMLElement, surface: DisplaySurface, module: DisplayModuleDefinition, preview: HTMLElement): void {
    const lang = this.plugin.settings.language;
    new Setting(container)
      .setName(t(lang, "settings.layoutDesigner.showRegion"))
      .setDesc(t(lang, "settings.layoutDesigner.showRegionDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.isDisplayModuleVisible(surface, module.id)).onChange(async (value) => {
          await this.setDisplayModuleVisible(surface, module.id, value);
          preview.empty();
          container.empty();
          this.renderLayoutPreview(preview, surface, container);
          this.renderLayoutModuleInspector(container, surface, module.id, preview);
        });
      });
  }

  private renderLinkedModuleVisibilitySetting(
    container: HTMLElement,
    surface: DisplaySurface,
    moduleId: DisplayModuleId,
    labelKey: string,
    preview: HTMLElement
  ): void {
    const linked = getDisplayModule(moduleId);
    if (!linked || !linked.supportedSurfaces.includes(surface)) {
      return;
    }
    new Setting(container)
      .setName(t(this.plugin.settings.language, labelKey))
      .setDesc(linked.description)
      .addToggle((toggle) => {
        toggle.setValue(this.isDisplayModuleVisible(surface, moduleId)).onChange(async (value) => {
          await this.setDisplayModuleVisible(surface, moduleId, value);
          preview.empty();
          this.renderLayoutPreview(preview, surface, container);
        });
      });
  }

  private renderLayoutInspectorHint(container: HTMLElement, key: string): void {
    container.createEl("p", {
      cls: "setting-item-description memos-plus-layout-inspector-hint",
      text: t(this.plugin.settings.language, key)
    });
  }

  private renderLayoutInspectorActions(
    container: HTMLElement,
    surface: DisplaySurface,
    module: DisplayModuleDefinition,
    preview: HTMLElement,
    fullSettingsTab?: SettingsTabId
  ): void {
    const lang = this.plugin.settings.language;
    const actions = container.createDiv({ cls: "memos-plus-layout-inspector-actions" });
    const moveUp = actions.createEl("button", {
      text: t(lang, "settings.layoutDesigner.moveUp"),
      attr: { type: "button" }
    });
    moveUp.disabled = !this.canMoveLayoutModule(surface, module.id, -1);
    moveUp.addEventListener("click", async () => {
      await this.moveLayoutModule(surface, module.id, -1);
      preview.empty();
      container.empty();
      this.renderLayoutPreview(preview, surface, container);
      this.renderLayoutModuleInspector(container, surface, module.id, preview);
    });
    const moveDown = actions.createEl("button", {
      text: t(lang, "settings.layoutDesigner.moveDown"),
      attr: { type: "button" }
    });
    moveDown.disabled = !this.canMoveLayoutModule(surface, module.id, 1);
    moveDown.addEventListener("click", async () => {
      await this.moveLayoutModule(surface, module.id, 1);
      preview.empty();
      container.empty();
      this.renderLayoutPreview(preview, surface, container);
      this.renderLayoutModuleInspector(container, surface, module.id, preview);
    });
    actions
      .createEl("button", {
        text: t(lang, "settings.layoutDesigner.hideRegion"),
        attr: { type: "button" }
      })
      .addEventListener("click", async () => {
        await this.setDisplayModuleVisible(surface, module.id, false);
        preview.empty();
        container.empty();
        this.renderLayoutPreview(preview, surface, container);
        this.renderLayoutModuleInspector(container, surface, module.id, preview);
      });
    actions
      .createEl("button", {
        text: t(lang, "settings.layoutDesigner.restoreDefault"),
        attr: { type: "button" }
      })
      .addEventListener("click", async () => {
        await this.setDisplayModuleVisible(surface, module.id, module.defaultVisible);
        preview.empty();
        container.empty();
        this.renderLayoutPreview(preview, surface, container);
        this.renderLayoutModuleInspector(container, surface, module.id, preview);
      });
    actions
      .createEl("button", {
        text: t(lang, "settings.layoutDesigner.openFullSettings"),
        attr: { type: "button" }
      })
      .addEventListener("click", () => {
        this.switchSettingsTab(fullSettingsTab ?? this.fullSettingsTabForModule(module.id));
      });
  }

  private canMoveLayoutModule(surface: DisplaySurface, moduleId: DisplayModuleId, delta: -1 | 1): boolean {
    const orderedModules = resolveLayoutSurfaceModules(this.getViewLayout(surface), surface).orderedModules;
    const index = orderedModules.indexOf(moduleId);
    const targetIndex = index + delta;
    return index >= 0 && targetIndex >= 0 && targetIndex < orderedModules.length;
  }

  private async moveLayoutModule(surface: DisplaySurface, moduleId: DisplayModuleId, delta: -1 | 1): Promise<void> {
    const layout = this.getViewLayout(surface);
    const orderedModules = resolveLayoutSurfaceModules(layout, surface).orderedModules;
    const index = orderedModules.indexOf(moduleId);
    const targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedModules.length) {
      return;
    }
    const nextOrder = [...orderedModules];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    await this.setViewLayout(
      surface,
      normalizeViewLayout(
        {
          mode: "custom",
          visibleModules: nextOrder,
          order: nextOrder,
          compactMode: layout.compactMode
        },
        surface
      )
    );
  }

  private async moveLayoutModuleBefore(surface: DisplaySurface, sourceModuleId: DisplayModuleId, targetModuleId: DisplayModuleId): Promise<void> {
    const layout = this.getViewLayout(surface);
    const orderedModules = resolveLayoutSurfaceModules(layout, surface).orderedModules;
    const sourceIndex = orderedModules.indexOf(sourceModuleId);
    const targetIndex = orderedModules.indexOf(targetModuleId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    const nextOrder = [...orderedModules];
    const [source] = nextOrder.splice(sourceIndex, 1);
    const nextTargetIndex = nextOrder.indexOf(targetModuleId);
    nextOrder.splice(nextTargetIndex, 0, source);
    await this.setViewLayout(
      surface,
      normalizeViewLayout(
        {
          mode: "custom",
          visibleModules: nextOrder,
          order: nextOrder,
          compactMode: layout.compactMode
        },
        surface
      )
    );
  }

  private fullSettingsTabForModule(moduleId: DisplayModuleId): SettingsTabId {
    if (moduleId === "taskDirectory" || moduleId === "organizeDirectory" || moduleId === "projectDirectory" || moduleId === "projectFilters" || moduleId === "tagFilters") {
      return "directoryFilters";
    }
    if (moduleId === "quickInput" || moduleId === "inputToolbar" || moduleId === "sendButton" || moduleId === "moreMenu") {
      return "inputTools";
    }
    return "layout";
  }

  private getSelectedLayoutModule(surface: DisplaySurface): DisplayModuleDefinition {
    const selected = getDisplayModule(this.selectedLayoutModuleId);
    if (selected?.supportedSurfaces.includes(surface)) {
      return selected;
    }
    return modulesForSurface(surface)[0];
  }

  private isDisplayModuleVisible(surface: DisplaySurface, moduleId: DisplayModuleId): boolean {
    return resolveLayoutSurfaceModules(this.getViewLayout(surface), surface).modules.has(moduleId);
  }

  private async setDisplayModuleVisible(surface: DisplaySurface, moduleId: DisplayModuleId, visible: boolean): Promise<void> {
    const layout = this.getViewLayout(surface);
    const current = new Set(resolveLayoutSurfaceModules(layout, surface).orderedModules);
    if (visible) {
      current.add(moduleId);
    } else {
      current.delete(moduleId);
    }
    await this.setViewLayout(
      surface,
      normalizeViewLayout(
        {
          mode: "custom",
          visibleModules: [...current],
          order: layout.order,
          compactMode: layout.compactMode
        },
        surface
      )
    );
  }

  private renderDesktopHomeLayoutSettings(container: HTMLElement): void {
    this.renderViewLayoutSettings(container, "home", "settings.displayContentHome", "settings.displayContentHomeDesc");
    this.renderDisplaySettings(container);
  }

  private renderSidebarLayoutSettings(container: HTMLElement): void {
    this.renderQuickInputStartupCard(container);
    this.renderViewLayoutSettings(container, "sidebar", "settings.displayContentSidebar", "settings.displayContentSidebarDesc");
    this.renderQuickInputSettings(container, { includeStartupToggles: false });
  }

  private renderMobileLayoutSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderViewLayoutSettings(container, "mobile", "settings.displayContentMobile", "settings.displayContentMobileDesc");
    new Setting(container)
      .setName(t(lang, "settings.mobileFab"))
      .setDesc(t(lang, "settings.mobileFabDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.mobileFab).onChange(async (value) => {
          this.plugin.settings.mobileFab = value;
          await this.plugin.persistSettings();
        });
      });
    this.renderMobileLightHomeSettings(container);
  }

  private async persistLayoutAffectingSetting(): Promise<void> {
    await this.plugin.persistSettings();
    await this.plugin.refreshLayoutViews("layout-settings");
  }

  private renderDirectoryFilterSettings(container: HTMLElement): void {
    this.renderFilterSettings(container);
    this.renderOrganizerDirectorySettings(container);
    this.renderIconOverrideSettings(container);
  }

  private renderIconOverrideSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.iconOverrides", "settings.iconOverridesDesc");
    const wrap = container.createDiv({ cls: "memos-plus-organizer-settings-list memos-plus-icon-override-settings-list" });
    for (const item of this.iconOverrideItems()) {
      const current = this.plugin.settings.iconOverrides[item.id];
      let type: IconOverrideType = current?.type ?? "lucide";
      let value = current?.value ?? "";
      new Setting(wrap)
        .setName(item.label)
        .setDesc(t(lang, "settings.iconOverrideItemDesc").replace("{fallback}", item.fallbackIcon))
        .addDropdown((dropdown) => {
          dropdown
            .addOption("emoji", t(lang, "settings.iconOverrideTypeEmoji"))
            .addOption("lucide", t(lang, "settings.iconOverrideTypeLucide"))
            .setValue(type)
            .onChange(async (nextType) => {
              type = nextType === "emoji" ? "emoji" : "lucide";
              await this.setIconOverride(item.id, { type, value });
            });
        })
        .addText((text) => {
          text
            .setPlaceholder(type === "emoji" ? "⭐" : item.fallbackIcon)
            .setValue(value)
            .onChange(async (nextValue) => {
              value = nextValue;
              await this.setIconOverride(item.id, { type, value });
            });
        })
        .addButton((button) => {
          button.setButtonText(t(lang, "settings.iconOverrideReset")).onClick(async () => {
            await this.setIconOverride(item.id, null);
          });
        });
    }
  }

  private iconOverrideItems(): Array<{ id: string; label: string; fallbackIcon: string }> {
    const lang = this.plugin.settings.language;
    const base = CONFIGURABLE_ICON_ITEM_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: t(lang, definition.labelKey),
      fallbackIcon: definition.fallbackIcon
    }));
    const sidebarItems = this.collectSidebarIconOverrideItems(this.plugin.settings.sidebarItems);
    const seen = new Set<string>();
    return [...base, ...sidebarItems].filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  private collectSidebarIconOverrideItems(items: SidebarItem[]): Array<{ id: string; label: string; fallbackIcon: string }> {
    return items.flatMap((item) => {
      const current = {
        id: sidebarItemIconOverrideId(item.id),
        label: item.title,
        fallbackIcon: item.icon || (item.type === "group" ? "folder" : "filter")
      };
      if (item.type === "group") {
        return [current, ...this.collectSidebarIconOverrideItems(item.children)];
      }
      return [current];
    });
  }

  private async setIconOverride(itemId: string, config: IconOverrideConfig | null): Promise<void> {
    const next = { ...this.plugin.settings.iconOverrides };
    const normalized = config ? normalizeIconOverrideConfig(config) : null;
    if (normalized) {
      next[itemId] = normalized;
    } else {
      delete next[itemId];
    }
    this.plugin.settings.iconOverrides = normalizeIconOverrides(next);
    await this.persistLayoutAffectingSetting();
  }

  private renderPerformanceDataSettings(container: HTMLElement): void {
    this.renderPerformanceSwitchSettings(container);
  }

  private renderPerformanceSwitchSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.performanceData", "settings.performanceDataDesc");
    new Setting(container)
      .setName(t(lang, "settings.performanceDebugMode"))
      .setDesc(t(lang, "settings.performanceDebugModeDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.performanceDebugMode).onChange(async (value) => {
          this.plugin.settings.performanceDebugMode = value;
          await this.plugin.persistSettings();
        })
      );
    new Setting(container)
      .setName(t(lang, "settings.mobilePerformanceMode"))
      .setDesc(t(lang, "settings.mobilePerformanceModeDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mobilePerformanceMode).onChange(async (value) => {
          this.plugin.settings.mobilePerformanceMode = value;
          await this.plugin.persistSettings();
        })
      );
    new Setting(container)
      .setName(t(lang, "settings.performanceSafeMode"))
      .setDesc(t(lang, "settings.performanceSafeModeDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.performanceSafeMode).onChange(async (value) => {
          this.plugin.settings.performanceSafeMode = value;
          await this.plugin.persistSettings();
        })
      );
  }

  private renderDisplayContentSettings(container: HTMLElement): void {
    this.renderSectionHeader(container, "settings.displayContent", "settings.displayContentDesc");
    this.renderViewLayoutSettings(container, "home", "settings.displayContentHome", "settings.displayContentHomeDesc");
    this.renderViewLayoutSettings(container, "sidebar", "settings.displayContentSidebar", "settings.displayContentSidebarDesc");
    this.renderViewLayoutSettings(container, "mobile", "settings.displayContentMobile", "settings.displayContentMobileDesc");

    this.renderSectionHeader(container, "settings.displayContentSync", "settings.displayContentSyncDesc");
    this.renderDisplayContentSyncSettings(container);
  }

  private renderDisplayContentSyncSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    new Setting(container)
      .setName(t(lang, "settings.displayContentApplyHomeToSidebar"))
      .setDesc(t(lang, "settings.displayContentApplyHomeToSidebarDesc"))
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.displayContentApply")).onClick(async () => {
          this.plugin.settings.sidebarLayout = copyViewLayoutToSurface(this.plugin.settings.homeLayout, "sidebar");
          await this.plugin.persistSettings();
          await this.plugin.refreshLayoutViews("layout-settings");
          this.display();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.displayContentApplySidebarToMobile"))
      .setDesc(t(lang, "settings.displayContentApplySidebarToMobileDesc"))
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.displayContentApply")).onClick(async () => {
          this.plugin.settings.mobileLayout = copyViewLayoutToSurface(this.plugin.settings.sidebarLayout, "mobile");
          await this.plugin.persistSettings();
          await this.plugin.refreshLayoutViews("layout-settings");
          this.display();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.displayContentUseSameForAll"))
      .setDesc(t(lang, "settings.displayContentUseSameForAllDesc"))
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.displayContentApply")).onClick(async () => {
          const layouts = sameViewLayoutForAllSurfaces(this.plugin.settings.homeLayout);
          this.plugin.settings.homeLayout = layouts.home;
          this.plugin.settings.sidebarLayout = layouts.sidebar;
          this.plugin.settings.mobileLayout = layouts.mobile;
          await this.plugin.persistSettings();
          await this.plugin.refreshLayoutViews("layout-settings");
          this.display();
        });
      });
  }

  private renderViewLayoutSettings(container: HTMLElement, surface: DisplaySurface, titleKey: string, descKey: string): void {
    const lang = this.plugin.settings.language;
    const layout = this.getViewLayout(surface);
    this.renderSectionHeader(container, titleKey, descKey);
    new Setting(container)
      .setName(t(lang, "settings.displayContentMode"))
      .setDesc(t(lang, "settings.displayContentModeDesc"))
      .addDropdown((dropdown) => {
        for (const mode of DISPLAY_LAYOUT_MODES) {
          dropdown.addOption(mode, t(lang, `settings.displayLayoutMode.${mode}`));
        }
        dropdown.setValue(layout.mode).onChange(async (value) => {
          const current = this.getViewLayout(surface);
          await this.setViewLayout(surface, normalizeViewLayout({ mode: value, compactMode: current.compactMode }, surface));
          this.display();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.displayContentCompactMode"))
      .setDesc(t(lang, "settings.displayContentCompactModeDesc"))
      .addToggle((toggle) => {
        toggle.setValue(layout.compactMode).onChange(async (value) => {
          const current = this.getViewLayout(surface);
          await this.setViewLayout(
            surface,
            normalizeViewLayout(
              {
                mode: current.mode,
                visibleModules: current.visibleModules,
                order: current.order,
                compactMode: value
              },
              surface
            )
          );
          this.display();
        });
      });
    if (layout.mode !== "custom") {
      return;
    }
    const customWrap = container.createDiv({ cls: "memos-plus-organizer-settings-list memos-plus-display-module-settings" });
    const visible = new Set(layout.visibleModules);
    for (const module of modulesForSurface(surface)) {
      new Setting(customWrap)
        .setName(module.name)
        .setDesc(`${module.description} · ${t(lang, `settings.displayPerformance.${module.performanceCost}`)}`)
        .addToggle((toggle) => {
          toggle.setValue(visible.has(module.id)).onChange(async (value) => {
            const currentLayout = this.getViewLayout(surface);
            const next = new Set(resolveLayoutSurfaceModules(currentLayout, surface).orderedModules);
            if (value) {
              next.add(module.id);
            } else {
              next.delete(module.id);
            }
            await this.setViewLayout(
              surface,
              normalizeViewLayout(
                {
                  mode: "custom",
                  visibleModules: [...next],
                  order: currentLayout.order,
                  compactMode: currentLayout.compactMode
                },
                surface
              )
            );
          });
        });
    }
  }

  private getViewLayout(surface: DisplaySurface): ViewLayoutSettings {
    if (surface === "home") {
      return this.plugin.settings.homeLayout;
    }
    if (surface === "sidebar") {
      return this.plugin.settings.sidebarLayout;
    }
    return this.plugin.settings.mobileLayout;
  }

  private async setViewLayout(surface: DisplaySurface, layout: ViewLayoutSettings): Promise<void> {
    if (surface === "home") {
      this.plugin.settings.homeLayout = layout;
    } else if (surface === "sidebar") {
      this.plugin.settings.sidebarLayout = layout;
    } else {
      this.plugin.settings.mobileLayout = layout;
    }
    await this.plugin.persistSettings();
    await this.plugin.refreshLayoutViews("layout-settings");
  }

  private renderMobileLightHomeSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.mobileLightHome", "settings.mobileLightHomeDesc");
    new Setting(container)
      .setName(t(lang, "settings.mobileLightHomeEnabled"))
      .setDesc(t(lang, "settings.mobileLightHomeEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.mobileLightHomeEnabled).onChange(async (value) => {
          this.plugin.settings.mobileLightHomeEnabled = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.mobileLightHomeShowLaterButton"))
      .setDesc(t(lang, "settings.mobileLightHomeShowLaterButtonDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.mobileLightHomeShowLaterButton).onChange(async (value) => {
          this.plugin.settings.mobileLightHomeShowLaterButton = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.mobileLightHomeRecentCount"))
      .setDesc(t(lang, "settings.mobileLightHomeRecentCountDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(1, 30, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.mobileLightHomeRecentCount)
          .onChange(async (value) => {
            this.plugin.settings.mobileLightHomeRecentCount = normalizeMobileLightHomeRecentCount(value);
            await this.plugin.persistSettings();
          });
      });

    const sectionWrap = container.createDiv({ cls: "memos-plus-organizer-settings-list" });
    for (const sectionId of Object.keys(DEFAULT_MOBILE_LIGHT_HOME_SECTIONS) as Array<keyof MobileLightHomeSectionsSettings>) {
      const current = this.plugin.settings.mobileLightHomeSections[sectionId];
      new Setting(sectionWrap)
        .setName(t(lang, `mobileLightHome.section.${sectionId}`))
        .setDesc(t(lang, "settings.mobileLightHomeSectionDesc"))
        .addToggle((toggle) => {
          toggle.setValue(current.visible).onChange(async (value) => {
            const latest = this.plugin.settings.mobileLightHomeSections[sectionId];
            this.plugin.settings.mobileLightHomeSections = normalizeMobileLightHomeSections({
              ...this.plugin.settings.mobileLightHomeSections,
              [sectionId]: { ...latest, visible: value }
            });
            await this.plugin.persistSettings();
          });
        })
        .addSlider((slider) => {
          slider
            .setLimits(96, 360, 8)
            .setDynamicTooltip()
            .setValue(current.height)
            .onChange(async (value) => {
              const latest = this.plugin.settings.mobileLightHomeSections[sectionId];
              this.plugin.settings.mobileLightHomeSections = normalizeMobileLightHomeSections({
                ...this.plugin.settings.mobileLightHomeSections,
                [sectionId]: { ...latest, height: value }
              });
              await this.plugin.persistSettings();
            });
        });
    }
  }

  private renderOrganizerDirectorySettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.organizerPanel", "settings.organizerPanelDesc");
    new Setting(container)
      .setName(t(lang, "settings.organizerPanelEnabled"))
      .setDesc(t(lang, "settings.organizerPanelEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerPanelEnabled).onChange(async (value) => {
          this.plugin.settings.organizerPanelEnabled = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.organizerTaskPriorityBranchesEnabled"))
      .setDesc(t(lang, "settings.organizerTaskPriorityBranchesEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerTaskPriorityBranchesEnabled).onChange(async (value) => {
          this.plugin.settings.organizerTaskPriorityBranchesEnabled = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.organizerTaskDateBranchesEnabled"))
      .setDesc(t(lang, "settings.organizerTaskDateBranchesEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerTaskDateBranchesEnabled).onChange(async (value) => {
          this.plugin.settings.organizerTaskDateBranchesEnabled = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.organizerTasksDefaultExpanded"))
      .setDesc(t(lang, "settings.organizerTasksDefaultExpandedDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.organizerTasksDefaultExpanded).onChange(async (value) => {
          this.plugin.settings.organizerTasksDefaultExpanded = value;
          await this.persistLayoutAffectingSetting();
        });
      });

    this.renderSectionHeader(container, "settings.taskManagementVisibleItems", "settings.taskManagementVisibleItemsDesc");
    const taskManagementWrap = container.createDiv({ cls: "memos-plus-organizer-settings-list" });
    for (const definition of TASK_MANAGEMENT_VISIBLE_ITEM_DEFINITIONS) {
      new Setting(taskManagementWrap)
        .setName(t(lang, definition.labelKey))
        .setDesc(t(lang, "settings.taskManagementVisibleItemDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.taskManagementVisibleItems[definition.id]).onChange(async (value) => {
            this.plugin.settings.taskManagementVisibleItems = normalizeTaskManagementVisibleItems({
              ...this.plugin.settings.taskManagementVisibleItems,
              [definition.id]: value
            });
            await this.persistLayoutAffectingSetting();
          });
        });
    }

    const sectionWrap = container.createDiv({ cls: "memos-plus-organizer-settings-list" });
    for (const definition of ORGANIZER_PANEL_SECTION_DEFINITIONS) {
      const current = this.plugin.settings.organizerPanelSections[definition.id];
      new Setting(sectionWrap)
        .setName(t(lang, definition.labelKey))
        .setDesc(t(lang, "settings.organizerPanelSectionDesc"))
        .addToggle((toggle) => {
          toggle.setValue(current.visible).onChange(async (value) => {
            const latest = this.plugin.settings.organizerPanelSections[definition.id];
            this.plugin.settings.organizerPanelSections = normalizeOrganizerPanelSections({
              ...this.plugin.settings.organizerPanelSections,
              [definition.id]: {
                ...latest,
                visible: value
              }
            });
            await this.persistLayoutAffectingSetting();
          });
        });
    }
  }

  private renderInputToolSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.inputToolSettings", "settings.inputToolSettingsDesc");
    this.renderQuickCaptureContentSourceSettings(container);
    this.renderQuickInputSettings(container);
    this.renderToolbarSettings(container);
    new Setting(container)
      .setName(t(lang, "settings.attachmentFolder"))
      .setDesc(t(lang, "settings.attachmentFolderDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_ATTACHMENT_FOLDER)
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolder = normalizePath(value.trim() || DEFAULT_ATTACHMENT_FOLDER);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.imageHandlingMode"))
      .setDesc(t(lang, "settings.imageHandlingModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", t(lang, "imageHandling.auto"))
          .addOption("memos", t(lang, "imageHandling.memos"))
          .addOption("image-auto-upload", t(lang, "imageHandling.imageAutoUpload"))
          .setValue(this.plugin.settings.imageHandlingMode)
          .onChange(async (value) => {
            this.plugin.settings.imageHandlingMode = normalizeImageHandlingMode(value);
            await this.plugin.persistSettings();
          });
      });
    this.renderCalloutSettings(container);
  }

  private renderComposerAppearanceSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.composerAppearance", "settings.composerAppearanceDesc");
    new Setting(container)
      .setName(t(lang, "settings.composerBorderColor"))
      .setDesc(t(lang, "settings.composerBorderColorDesc"))
      .addColorPicker((color) => {
        color.setValue(this.plugin.settings.composerBorderColor || DEFAULT_COMPOSER_BORDER_COLOR).onChange(async (value) => {
          this.plugin.settings.composerBorderColor = normalizeOptionalHexColor(value, DEFAULT_COMPOSER_BORDER_COLOR);
          await this.plugin.persistSettings();
        });
      })
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.composerColorReset")).onClick(async () => {
          this.plugin.settings.composerBorderColor = DEFAULT_COMPOSER_BORDER_COLOR;
          await this.plugin.persistSettings();
          this.display();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.composerBackgroundColor"))
      .setDesc(t(lang, "settings.composerBackgroundColorDesc"))
      .addColorPicker((color) => {
        color.setValue(this.plugin.settings.composerBackgroundColor || COMPOSER_BACKGROUND_COLOR_PICKER_FALLBACK).onChange(async (value) => {
          this.plugin.settings.composerBackgroundColor = normalizeOptionalHexColor(value, DEFAULT_COMPOSER_BACKGROUND_COLOR);
          await this.plugin.persistSettings();
        });
      })
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.composerUseThemeBackground")).onClick(async () => {
          this.plugin.settings.composerBackgroundColor = DEFAULT_COMPOSER_BACKGROUND_COLOR;
          await this.plugin.persistSettings();
          this.display();
        });
      });
  }

  private renderQuickInputStartupCard(container: HTMLElement, descKey = "settings.quickInputStartupDesc"): void {
    const lang = this.plugin.settings.language;
    const card = container.createDiv({ cls: "memos-plus-quick-input-startup-card" });
    const header = card.createDiv({ cls: "memos-plus-quick-input-startup-header" });
    header.createSpan({ cls: "memos-plus-quick-input-startup-badge", text: t(lang, "settings.quickInputStartupBadge") });
    header.createEl("h3", { cls: "memos-plus-quick-input-startup-title", text: t(lang, "settings.quickInputStartupTitle") });
    card.createDiv({ cls: "memos-plus-quick-input-startup-desc", text: t(lang, descKey) });
    this.renderQuickInputEnabledToggle(card, "memos-plus-quick-input-startup-setting");
    this.renderQuickInputAutoOpenToggle(card, "memos-plus-quick-input-startup-setting");
  }

  private renderQuickInputSettings(container: HTMLElement, options: { includeStartupToggles?: boolean } = {}): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.quickInputSidebar", "settings.quickInputSidebarDesc");
    if (options.includeStartupToggles ?? true) {
      this.renderQuickInputEnabledToggle(container);
      this.renderQuickInputAutoOpenToggle(container);
    }
    new Setting(container)
      .setName(t(lang, "settings.quickInputPreserveDraft"))
      .setDesc(t(lang, "settings.quickInputPreserveDraftDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.quickInputPreserveDraft).onChange(async (value) => {
          this.plugin.settings.quickInputPreserveDraft = value;
          if (!value) {
            this.plugin.settings.quickInputDraft = "";
          }
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickInputDefaultSendAction"))
      .setDesc(t(lang, "settings.quickInputDefaultSendActionDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("memo", t(lang, "sendAction.memo"))
          .addOption("project", t(lang, "sendAction.project"))
          .addOption("ask", t(lang, "sendAction.ask"))
          .setValue(this.plugin.settings.quickInputDefaultSendAction)
          .onChange(async (value) => {
            this.plugin.settings.quickInputDefaultSendAction = normalizeQuickInputSendAction(value);
            await this.persistLayoutAffectingSetting();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickInputShowDirectory"))
      .setDesc(t(lang, "settings.quickInputShowDirectoryDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.quickInputShowDirectory).onChange(async (value) => {
          this.plugin.settings.quickInputShowDirectory = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickInputDirectoryLimit"))
      .setDesc(t(lang, "settings.quickInputDirectoryLimitDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "50";
        text.setValue(String(this.plugin.settings.quickInputDirectoryLimit)).onChange(async (value) => {
          this.plugin.settings.quickInputDirectoryLimit = normalizeQuickInputDirectoryLimit(value, DEFAULT_SETTINGS.quickInputDirectoryLimit);
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickInputDirectoryExpandedLimit"))
      .setDesc(t(lang, "settings.quickInputDirectoryExpandedLimitDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "50";
        text.setValue(String(this.plugin.settings.quickInputDirectoryExpandedLimit)).onChange(async (value) => {
          this.plugin.settings.quickInputDirectoryExpandedLimit = normalizeQuickInputDirectoryLimit(
            value,
            DEFAULT_SETTINGS.quickInputDirectoryExpandedLimit
          );
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickInputDirectoryMobileExpandedLimit"))
      .setDesc(t(lang, "settings.quickInputDirectoryMobileExpandedLimitDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "30";
        text.setValue(String(this.plugin.settings.quickInputDirectoryMobileExpandedLimit)).onChange(async (value) => {
          this.plugin.settings.quickInputDirectoryMobileExpandedLimit = normalizeQuickInputDirectoryLimit(
            value,
            DEFAULT_SETTINGS.quickInputDirectoryMobileExpandedLimit
          );
          await this.plugin.persistSettings();
        });
      });
  }

  private renderQuickInputEnabledToggle(container: HTMLElement, className?: string): void {
    const lang = this.plugin.settings.language;
    const setting = new Setting(container)
      .setName(t(lang, "settings.quickInputEnabled"))
      .setDesc(t(lang, "settings.quickInputEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.quickInputEnabled).onChange(async (value) => {
          this.plugin.settings.quickInputEnabled = value;
          await this.persistLayoutAffectingSetting();
        });
      });
    if (className) {
      setting.settingEl.addClass(className);
    }
  }

  private renderQuickInputAutoOpenToggle(container: HTMLElement, className?: string): void {
    const lang = this.plugin.settings.language;
    const setting = new Setting(container)
      .setName(t(lang, "settings.quickInputAutoOpen"))
      .setDesc(t(lang, "settings.quickInputAutoOpenDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.quickInputAutoOpen).onChange(async (value) => {
          this.plugin.settings.quickInputAutoOpen = value;
          await this.plugin.persistSettings();
        });
      });
    if (className) {
      setting.settingEl.addClass(className);
    }
  }

  private renderQuickCaptureContentSourceSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.quickCaptureContentSource", "settings.quickCaptureContentSourceDesc");
    new Setting(container)
      .setName(t(lang, "settings.quickCaptureAutoSelection"))
      .setDesc(t(lang, "settings.quickCaptureAutoSelectionDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.quickCaptureAutoSelection).onChange(async (value) => {
          this.plugin.settings.quickCaptureAutoSelection = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickCaptureDetectClipboard"))
      .setDesc(t(lang, "settings.quickCaptureDetectClipboardDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.quickCaptureDetectClipboard).onChange(async (value) => {
          this.plugin.settings.quickCaptureDetectClipboard = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickCaptureClipboardMode"))
      .setDesc(t(lang, "settings.quickCaptureClipboardModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ask", t(lang, "quickCaptureClipboardMode.ask"))
          .addOption("replace", t(lang, "quickCaptureClipboardMode.replace"))
          .addOption("append", t(lang, "quickCaptureClipboardMode.append"))
          .addOption("off", t(lang, "quickCaptureClipboardMode.off"))
          .setValue(this.plugin.settings.quickCaptureClipboardMode)
          .onChange(async (value) => {
            this.plugin.settings.quickCaptureClipboardMode = normalizeQuickCaptureClipboardMode(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickCaptureExistingContentMode"))
      .setDesc(t(lang, "settings.quickCaptureExistingContentModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ask", t(lang, "quickCaptureExistingMode.ask"))
          .addOption("keep", t(lang, "quickCaptureExistingMode.keep"))
          .addOption("replace", t(lang, "quickCaptureExistingMode.replace"))
          .addOption("append", t(lang, "quickCaptureExistingMode.append"))
          .setValue(this.plugin.settings.quickCaptureExistingContentMode)
          .onChange(async (value) => {
            this.plugin.settings.quickCaptureExistingContentMode = normalizeQuickCaptureExistingContentMode(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.quickCaptureRecognizeClipboardLinks"))
      .setDesc(t(lang, "settings.quickCaptureRecognizeClipboardLinksDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.quickCaptureRecognizeClipboardLinks).onChange(async (value) => {
          this.plugin.settings.quickCaptureRecognizeClipboardLinks = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.linkAnalysisEnabled"))
      .setDesc(t(lang, "settings.linkAnalysisEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.linkAnalysisEnabled).onChange(async (value) => {
          this.plugin.settings.linkAnalysisEnabled = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.linkAnalysisMobileEnabled"))
      .setDesc(t(lang, "settings.linkAnalysisMobileEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.linkAnalysisMobileEnabled).onChange(async (value) => {
          this.plugin.settings.linkAnalysisMobileEnabled = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.linkAnalysisMaxLinks"))
      .setDesc(t(lang, "settings.linkAnalysisMaxLinksDesc"))
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.linkAnalysisMaxLinks))
          .onChange(async (value) => {
            this.plugin.settings.linkAnalysisMaxLinks = normalizeLinkAnalysisMaxLinks(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.linkAnalysisTimeoutMs"))
      .setDesc(t(lang, "settings.linkAnalysisTimeoutMsDesc"))
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.linkAnalysisTimeoutMs))
          .onChange(async (value) => {
            this.plugin.settings.linkAnalysisTimeoutMs = normalizeLinkAnalysisTimeoutMs(value);
            await this.plugin.persistSettings();
          });
      });
  }

  private renderToolbarSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const labels: Record<ComposerToolbarToolId, string> = {
      tag: "toolbar.insertTag",
      image: "toolbar.insertImage",
      unorderedList: "toolbar.insertUL",
      orderedList: "toolbar.insertOL",
      task: "toolbar.insertTask",
      table: "toolbar.insertTable",
      callout: "toolbar.calloutMode",
      codeBlock: "toolbar.insertCodeBlock",
      excalidraw: "toolbar.insertExcalidraw"
    };
    this.renderSectionHeader(container, "settings.toolbarSettings", "settings.toolbarSettingsDesc");
    for (const id of COMPOSER_TOOLBAR_TOOL_IDS) {
      new Setting(container)
        .setName(t(lang, labels[id]))
        .setDesc(t(lang, "settings.toolbarToolVisibilityDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.composerToolbar[id]).onChange(async (value) => {
            this.plugin.settings.composerToolbar = {
              ...this.plugin.settings.composerToolbar,
              [id]: value
            };
            await this.plugin.persistSettings();
          });
        });
    }
  }

  private renderCalloutSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.calloutSettings", "settings.calloutSettingsDesc");
    new Setting(container)
      .setName(t(lang, "settings.calloutEnabled"))
      .setDesc(t(lang, "settings.calloutEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calloutEnabled).onChange(async (value) => {
          this.plugin.settings.calloutEnabled = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.calloutType"))
      .setDesc(t(lang, "settings.calloutTypeDesc"))
      .addDropdown((dropdown) => {
        for (const type of CALLOUT_TYPES) {
          dropdown.addOption(type, type);
        }
        dropdown.setValue(this.plugin.settings.calloutType).onChange(async (value) => {
          this.plugin.settings.calloutType = normalizeCalloutType(value);
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.calloutFoldMode"))
      .setDesc(t(lang, "settings.calloutFoldModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", t(lang, "callout.fold.none"))
          .addOption("folded", t(lang, "callout.fold.folded"))
          .addOption("expanded", t(lang, "callout.fold.expanded"))
          .setValue(this.plugin.settings.calloutFoldMode)
          .onChange(async (value) => {
            this.plugin.settings.calloutFoldMode = normalizeCalloutFoldMode(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.calloutTitleMode"))
      .setDesc(t(lang, "settings.calloutTitleModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("firstLine", t(lang, "callout.title.firstLine"))
          .addOption("datetime", t(lang, "callout.title.datetime"))
          .addOption("file", t(lang, "callout.title.file"))
          .addOption("project", t(lang, "callout.title.project"))
          .addOption("heading", t(lang, "callout.title.heading"))
          .addOption("custom", t(lang, "callout.title.custom"))
          .setValue(this.plugin.settings.calloutTitleMode)
          .onChange(async (value) => {
            this.plugin.settings.calloutTitleMode = normalizeCalloutTitleMode(value);
            await this.plugin.persistSettings();
          });
      });
    const advancedCallout = this.renderSettingsDetails(container, "settings.advancedOptions", "settings.advancedOptionsDesc");
    new Setting(advancedCallout)
      .setName(t(lang, "settings.calloutTitleTemplate"))
      .setDesc(t(lang, "settings.calloutTitleTemplateDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_CALLOUT_SETTINGS.calloutTitleTemplate)
          .setValue(this.plugin.settings.calloutTitleTemplate)
          .onChange(async (value) => {
            this.plugin.settings.calloutTitleTemplate = normalizeTextSetting(value, DEFAULT_CALLOUT_SETTINGS.calloutTitleTemplate);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.calloutAutoForLongContent"))
      .setDesc(t(lang, "settings.calloutAutoForLongContentDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calloutAutoForLongContent).onChange(async (value) => {
          this.plugin.settings.calloutAutoForLongContent = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.calloutAutoLength"))
      .setDesc(t(lang, "settings.calloutAutoLengthDesc"))
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_CALLOUT_SETTINGS.calloutAutoLength))
          .setValue(String(this.plugin.settings.calloutAutoLength))
          .onChange(async (value) => {
            this.plugin.settings.calloutAutoLength = normalizeCalloutThreshold(Number(value), DEFAULT_CALLOUT_SETTINGS.calloutAutoLength);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.calloutAutoLines"))
      .setDesc(t(lang, "settings.calloutAutoLinesDesc"))
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_CALLOUT_SETTINGS.calloutAutoLines))
          .setValue(String(this.plugin.settings.calloutAutoLines))
          .onChange(async (value) => {
            this.plugin.settings.calloutAutoLines = normalizeCalloutThreshold(Number(value), DEFAULT_CALLOUT_SETTINGS.calloutAutoLines);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.calloutAutoForLinks"))
      .setDesc(t(lang, "settings.calloutAutoForLinksDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calloutAutoForLinks).onChange(async (value) => {
          this.plugin.settings.calloutAutoForLinks = value;
          await this.plugin.persistSettings();
        });
      });
  }

  private renderSendToFileSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.sendToFile", "settings.sendToFileDesc");
    new Setting(container)
      .setName(t(lang, "settings.sendToFileEnabled"))
      .setDesc(t(lang, "settings.sendToFileEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.sendToFileEnabled).onChange(async (value) => {
          this.plugin.settings.sendToFileEnabled = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.sendToFileDefaultTag"))
      .setDesc(t(lang, "settings.sendToFileDefaultTagDesc"))
      .addText((text) => {
        text
          .setPlaceholder("病")
          .setValue(this.plugin.settings.sendToFileDefaultTag)
          .onChange(async (value) => {
            this.plugin.settings.sendToFileDefaultTag = normalizeFileTag(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.sendToFileCommonTags"))
      .setDesc(t(lang, "settings.sendToFileCommonTagsDesc"))
      .addTextArea((text) => {
        text
          .setPlaceholder(DEFAULT_SEND_TO_FILE_COMMON_TAGS.join("\n"))
          .setValue(this.plugin.settings.sendToFileCommonTags.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.sendToFileCommonTags = normalizeSendToFileCommonTags(value);
            await this.plugin.persistSettings();
          });
        text.inputEl.rows = 4;
      });
    new Setting(container)
      .setName(t(lang, "settings.sendToFileDefaultInsertPosition"))
      .setDesc(t(lang, "settings.sendToFileDefaultInsertPositionDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("heading-top", t(lang, "fileSend.position.headingTop"))
          .addOption("heading-bottom", t(lang, "fileSend.position.headingBottom"))
          .addOption("new-heading", t(lang, "fileSend.position.newHeading"))
          .addOption("file-end", t(lang, "fileSend.position.fileEnd"))
          .addOption("file-start", t(lang, "fileSend.position.fileStart"))
          .setValue(this.plugin.settings.sendToFileDefaultInsertPosition)
          .onChange(async (value) => {
            this.plugin.settings.sendToFileDefaultInsertPosition = normalizeFileInsertPosition(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.sendToFileNoHeadingBehavior"))
      .setDesc(t(lang, "settings.sendToFileNoHeadingBehaviorDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ask", t(lang, "fileSend.noHeading.ask"))
          .addOption("file-end", t(lang, "fileSend.position.fileEnd"))
          .addOption("file-start", t(lang, "fileSend.position.fileStart"))
          .setValue(this.plugin.settings.sendToFileNoHeadingBehavior)
          .onChange(async (value) => {
            this.plugin.settings.sendToFileNoHeadingBehavior = normalizeNoHeadingBehavior(value);
            await this.plugin.persistSettings();
          });
      });
  }

  private renderProjectSendTabSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.projectSendTabs", "settings.projectSendTabsDesc");

    const tabIds = normalizeProjectSendTabOrder(this.plugin.settings.projectSendTabOrder, this.plugin.settings.fileTemplateTabs);
    const hiddenTabs = new Set(normalizeProjectSendHiddenTabs(this.plugin.settings.projectSendHiddenTabs, this.plugin.settings.fileTemplateTabs));

    for (const [index, id] of tabIds.entries()) {
      const customTab = getProjectSendCustomTab(id, this.plugin.settings.fileTemplateTabs);
      const setting = new Setting(container)
        .setName(this.getProjectSendTabLabel(id))
        .setDesc(customTab ? formatProjectSendCustomTabDesc(customTab) : t(lang, "settings.projectSendFixedTabDesc"));

      setting.addToggle((toggle) => {
        toggle.setValue(!hiddenTabs.has(id)).onChange(async (visible) => {
          const nextHidden = new Set(hiddenTabs);
          if (visible) {
            nextHidden.delete(id);
          } else {
            nextHidden.add(id);
          }
          this.plugin.settings.projectSendHiddenTabs = normalizeProjectSendHiddenTabs([...nextHidden], this.plugin.settings.fileTemplateTabs);
          await this.plugin.persistSettings();
          this.display();
        });
      });

      setting.addButton((button) => {
        button.setButtonText("↑").setDisabled(index === 0).onClick(async () => {
          await this.moveProjectSendTab(id, -1);
        });
      });
      setting.addButton((button) => {
        button.setButtonText("↓").setDisabled(index === tabIds.length - 1).onClick(async () => {
          await this.moveProjectSendTab(id, 1);
        });
      });

      if (customTab) {
        let renameInput: HTMLInputElement | null = null;
        setting.addText((text) => {
          text.setValue(customTab.name).setPlaceholder(customTab.name);
          renameInput = text.inputEl;
        });
        setting.addButton((button) => {
          button.setButtonText(t(lang, "settings.projectSendTabRename")).onClick(async () => {
            await this.renameProjectSendCustomTab(customTab.id, renameInput?.value ?? "");
          });
        });
        setting.addButton((button) => {
          button.setButtonText(t(lang, "settings.projectSendTabDelete")).onClick(async () => {
            await this.deleteProjectSendCustomTab(customTab.id);
          });
        });
      }
    }

    let addInput: HTMLInputElement | null = null;
    new Setting(container)
      .setName(t(lang, "settings.projectSendTabAdd"))
      .setDesc(t(lang, "settings.projectSendTabAddDesc"))
      .addText((text) => {
        text.setPlaceholder("病");
        addInput = text.inputEl;
      })
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.projectSendTabAddButton")).onClick(async () => {
          await this.addProjectSendCustomTab(addInput?.value ?? "");
        });
      });
  }

  private getProjectSendTabLabel(id: string): string {
    const lang = this.plugin.settings.language;
    const customTab = getProjectSendCustomTab(id, this.plugin.settings.fileTemplateTabs);
    if (customTab) {
      return customTab.name;
    }
    if (isProjectSendFixedTab(id)) {
      return t(lang, `fileSend.mode.${id}`);
    }
    return id;
  }

  private async moveProjectSendTab(id: string, delta: number): Promise<void> {
    const order = normalizeProjectSendTabOrder(this.plugin.settings.projectSendTabOrder, this.plugin.settings.fileTemplateTabs);
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) {
      return;
    }
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    this.plugin.settings.projectSendTabOrder = normalizeProjectSendTabOrder(next, this.plugin.settings.fileTemplateTabs);
    await this.plugin.persistSettings();
    this.display();
  }

  private async addProjectSendCustomTab(value: string): Promise<void> {
    const tag = normalizeFileTag(value);
    if (!tag) {
      return;
    }
    const nextTab = createTagFilterFileTemplateTab(tag);
    if (!nextTab) {
      return;
    }
    const tabs = normalizeFileTemplateTabs([...this.plugin.settings.fileTemplateTabs, nextTab]);
    this.plugin.settings.fileTemplateTabs = tabs;
    this.plugin.settings.projectSendTagTabs = projectSendTagTabsFromFileTemplateTabs(tabs);
    this.plugin.settings.projectSendTabOrder = normalizeProjectSendTabOrder(
      [...this.plugin.settings.projectSendTabOrder, getProjectSendCustomTabId(nextTab.id)],
      tabs
    );
    this.plugin.settings.projectSendHiddenTabs = normalizeProjectSendHiddenTabs(this.plugin.settings.projectSendHiddenTabs, tabs);
    await this.plugin.persistSettings();
    this.display();
  }

  private async renameProjectSendCustomTab(tabId: string, value: string): Promise<void> {
    const name = normalizeTextSetting(value, "");
    if (!name) {
      return;
    }
    const tabs = normalizeFileTemplateTabs(this.plugin.settings.fileTemplateTabs.map((tab) => (tab.id === tabId ? { ...tab, name } : tab)));
    this.plugin.settings.fileTemplateTabs = tabs;
    this.plugin.settings.projectSendTagTabs = projectSendTagTabsFromFileTemplateTabs(tabs);
    this.plugin.settings.projectSendTabOrder = normalizeProjectSendTabOrder(this.plugin.settings.projectSendTabOrder, tabs);
    this.plugin.settings.projectSendHiddenTabs = normalizeProjectSendHiddenTabs(this.plugin.settings.projectSendHiddenTabs, tabs);
    await this.plugin.persistSettings();
    this.display();
  }

  private async deleteProjectSendCustomTab(tabId: string): Promise<void> {
    const id = getProjectSendCustomTabId(tabId);
    const tabs = this.plugin.settings.fileTemplateTabs.filter((item) => item.id !== tabId);
    this.plugin.settings.fileTemplateTabs = tabs;
    this.plugin.settings.projectSendTagTabs = projectSendTagTabsFromFileTemplateTabs(tabs);
    this.plugin.settings.projectSendTabOrder = normalizeProjectSendTabOrder(
      this.plugin.settings.projectSendTabOrder.filter((item) => item !== id),
      tabs
    );
    this.plugin.settings.projectSendHiddenTabs = normalizeProjectSendHiddenTabs(
      this.plugin.settings.projectSendHiddenTabs.filter((item) => item !== id),
      tabs
    );
    await this.plugin.persistSettings();
    this.display();
  }

  private renderManagedTemplateSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.templateManager", "settings.templateManagerDesc");
    const templates = this.plugin.settings.managedTemplates;

    if (templates.length === 0) {
      container.createEl("p", {
        cls: "setting-item-description",
        text: t(lang, "settings.templateManagerEmpty")
      });
    }

    templates.forEach((template, index) => {
      const setting = new Setting(container)
        .setName(template.name)
        .setDesc(this.formatManagedTemplateSummary(template));
      setting.addButton((button) => {
        button.setButtonText("↑").setDisabled(index === 0).onClick(async () => {
          await this.moveManagedTemplate(index, -1);
        });
      });
      setting.addButton((button) => {
        button.setButtonText("↓").setDisabled(index === templates.length - 1).onClick(async () => {
          await this.moveManagedTemplate(index, 1);
        });
      });
      setting.addButton((button) => {
        button.setButtonText(t(lang, "settings.templateManagerEdit")).onClick(() => {
          this.openManagedTemplateModal(template);
        });
      });
      setting.addButton((button) => {
        button.setButtonText(t(lang, "settings.templateManagerCopy")).onClick(async () => {
          this.plugin.settings.managedTemplates = normalizeManagedTemplates([...templates, cloneManagedTemplate(template)]);
          await this.plugin.persistSettings();
          this.display();
        });
      });
      setting.addButton((button) => {
        button.setButtonText(t(lang, "settings.templateManagerDelete")).onClick(async () => {
          this.plugin.settings.managedTemplates = templates.filter((item) => item.id !== template.id);
          await this.plugin.persistSettings();
          this.display();
        });
      });
    });

    new Setting(container).addButton((button) => {
      button.setButtonText(t(lang, "settings.templateManagerAdd")).onClick(() => {
        this.openManagedTemplateModal();
      });
    });
  }

  private formatManagedTemplateSummary(template: ManagedTemplate): string {
    const lang = this.plugin.settings.language;
    const entry = this.formatManagedTemplateEntry(template);
    const format = t(lang, `templateManager.insertFormat.${template.insertFormat}`);
    const afterSend =
      template.clearAfterSendMode === "custom"
        ? t(lang, template.clearAfterSend ? "settings.templateSummaryClearCustomYes" : "settings.templateSummaryClearCustomNo")
        : t(lang, "settings.templateSummaryFollowGlobal");
    return [
      `${t(lang, "settings.templateSummaryEntry")}：${entry}`,
      `${t(lang, "settings.templateSummaryFormat")}：${format}`,
      `${t(lang, "settings.templateSummaryAfterSend")}：${afterSend}`
    ]
      .filter(Boolean)
      .join(" · ");
  }

  private formatManagedTemplateEntry(template: ManagedTemplate): string {
    const lang = this.plugin.settings.language;
    if (template.targetSource === "project-tag") {
      return t(lang, "templateManager.purpose.project");
    }
    if (template.targetSource === "specific-tag") {
      return t(lang, "templateManager.purpose.tag-file");
    }
    if (template.targetSource === "recent-file") {
      return t(lang, "templateManager.purpose.recent");
    }
    if (template.targetSource === "vault-search" || template.targetSource === "fixed-file" || template.targetSource === "new-file") {
      return t(lang, "templateManager.purpose.search");
    }
    return t(lang, "templateManager.purpose.default");
  }

  private renderFileTemplateLibrarySettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.fileTemplateLibrary", "settings.fileTemplateLibraryDesc");

    new Setting(container)
      .setName(t(lang, "settings.fileTemplateLibraryFolder"))
      .setDesc(t(lang, "settings.fileTemplateLibraryFolderDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_FILE_TEMPLATE_LIBRARY_FOLDER)
          .setValue(this.plugin.settings.fileTemplateLibraryFolder)
          .onChange(async (value) => {
            this.plugin.settings.fileTemplateLibraryFolder = normalizeFileTemplateLibraryFolder(value);
            await this.plugin.persistSettings();
          });
      });

    new Setting(container)
      .setName(t(lang, "settings.fileTemplateLibraryDefaultFolder"))
      .setDesc(t(lang, "settings.fileTemplateLibraryDefaultFolderDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_FILE_TEMPLATE_LIBRARY_TARGET_FOLDER)
          .setValue(this.plugin.settings.fileTemplateLibraryDefaultFolder)
          .onChange(async (value) => {
            this.plugin.settings.fileTemplateLibraryDefaultFolder = normalizeFileTemplateLibraryDefaultFolder(value);
            await this.plugin.persistSettings();
          });
      });

    new Setting(container)
      .setName(t(lang, "settings.fileTemplateLibraryStatus"))
      .setDesc(
        t(lang, "settings.fileTemplateLibraryStatusDesc")
          .replace("{favorites}", String(this.plugin.settings.fileTemplateLibraryFavorites.length))
          .replace("{recent}", String(this.plugin.settings.fileTemplateLibraryRecent.length))
      )
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.fileTemplateLibraryClearRecent")).onClick(async () => {
          this.plugin.settings.fileTemplateLibraryRecent = [];
          await this.plugin.persistSettings();
          this.display();
        });
      });

    new Setting(container)
      .setName(t(lang, "settings.fileTemplateLibraryDefaultTab"))
      .setDesc(t(lang, "settings.fileTemplateLibraryDefaultTabDesc"))
      .addDropdown((dropdown) => {
        const options = this.fileTemplateLibraryDefaultTabOptions();
        for (const id of options) {
          dropdown.addOption(id, this.getFileTemplateLibraryTabLabel(id));
        }
        dropdown
          .setValue(normalizeVisibleFileTemplateLibraryDefaultTabId(this.plugin.settings.fileTemplateLibraryDefaultTabId, this.plugin.settings.fileTemplateTabs))
          .onChange(async (value) => {
            this.plugin.settings.fileTemplateLibraryDefaultTabId = normalizeVisibleFileTemplateLibraryDefaultTabId(
              value,
              this.plugin.settings.fileTemplateTabs
            );
            await this.plugin.persistSettings();
          });
      });

    this.renderFileTemplateTabManagement(container);
    this.renderFileTemplateTabInteractionSettings(container);

    const advancedLibrary = this.renderSettingsDetails(container, "settings.advancedOptions", "settings.fileTemplateLibraryAdvancedDesc");
    new Setting(advancedLibrary)
      .setName(t(lang, "settings.fileTemplateLibraryDefaults"))
      .setDesc(t(lang, "settings.fileTemplateLibraryDefaultsDesc"))
      .addTextArea((text) => {
        text
          .setPlaceholder("病 = 我的资源/模板/疾病.md\n项目 = 我的资源/模板/项目.md")
          .setValue(formatFileTemplateDefaultsForInput(this.plugin.settings.fileTemplateLibraryDefaults))
          .onChange(async (value) => {
            this.plugin.settings.fileTemplateLibraryDefaults = parseFileTemplateDefaultsInput(value);
            await this.plugin.persistSettings();
          });
        text.inputEl.rows = 4;
      });
  }

  private renderFileTemplateTabInteractionSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.fileTemplateTabInteraction", "settings.fileTemplateTabInteractionDesc");
    new Setting(container)
      .setName(t(lang, "settings.fileTemplateTabDesktopDrag"))
      .setDesc(t(lang, "settings.fileTemplateTabDesktopDragDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.fileTemplateTabInteraction.enableDesktopDrag).onChange(async (value) => {
          this.plugin.settings.fileTemplateTabInteraction = normalizeFileTemplateTabInteraction({
            ...this.plugin.settings.fileTemplateTabInteraction,
            enableDesktopDrag: value
          });
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.fileTemplateTabMobileReadOnly"))
      .setDesc(t(lang, "settings.fileTemplateTabMobileReadOnlyDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.fileTemplateTabInteraction.mobileReadOnly).onChange(async (value) => {
          this.plugin.settings.fileTemplateTabInteraction = normalizeFileTemplateTabInteraction({
            ...this.plugin.settings.fileTemplateTabInteraction,
            mobileReadOnly: value
          });
          await this.plugin.persistSettings();
          this.renderCurrentSettingsPanel();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.fileTemplateTabMobileDrag"))
      .setDesc(t(lang, "settings.fileTemplateTabMobileDragDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.fileTemplateTabInteraction.enableMobileDrag)
          .setDisabled(this.plugin.settings.fileTemplateTabInteraction.mobileReadOnly)
          .onChange(async (value) => {
            this.plugin.settings.fileTemplateTabInteraction = normalizeFileTemplateTabInteraction({
              ...this.plugin.settings.fileTemplateTabInteraction,
              enableMobileDrag: value
            });
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.fileTemplateTabMobileReorder"))
      .setDesc(t(lang, "settings.fileTemplateTabMobileReorderDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.fileTemplateTabInteraction.enableMobileReorder)
          .setDisabled(this.plugin.settings.fileTemplateTabInteraction.mobileReadOnly)
          .onChange(async (value) => {
            this.plugin.settings.fileTemplateTabInteraction = normalizeFileTemplateTabInteraction({
              ...this.plugin.settings.fileTemplateTabInteraction,
              enableMobileReorder: value
            });
            await this.plugin.persistSettings();
          });
      });
  }

  private renderFileTemplateTabManagement(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const section = container.createDiv({ cls: "memos-plus-file-template-tab-settings" });
    this.renderSectionHeader(section, "settings.fileTemplateTabs", "settings.fileTemplateTabsDesc");

    const groupTabs = this.plugin.settings.fileTemplateTabs.filter((tab) => tab.type === "template-group");
    if (groupTabs.length === 0) {
      section.createEl("p", {
        cls: "setting-item-description",
        text: t(lang, "settings.fileTemplateTabsEmpty")
      });
    }

    for (const tab of groupTabs) {
      const tabBox = section.createDiv({ cls: "memos-plus-file-template-tab-setting" });
      const header = new Setting(tabBox)
        .setName(tab.name)
        .setDesc(formatProjectSendCustomTabDesc(tab));
      header.addText((text) => {
        text.setValue(tab.name).setPlaceholder(t(lang, "settings.fileTemplateTabName")).onChange(async (value) => {
          await this.saveFileTemplateTabs(this.plugin.settings.fileTemplateTabs.map((item) => (item.id === tab.id ? { ...item, name: value } : item)));
        });
      });
      header.addButton((button) => {
        button.setButtonText(t(lang, "settings.projectSendTabDelete")).onClick(async () => {
          await this.deleteFileTemplateGroupTab(tab.id);
        });
      });

      new Setting(tabBox)
        .setName(t(lang, "settings.fileTemplateTabTemplatePaths"))
        .setDesc(t(lang, "settings.fileTemplateTabTemplatePathsDesc"))
        .addTextArea((text) => {
          text.setPlaceholder("我的资源/模板/病历模板.md\n我的资源/模板/项目模板.md").setValue(tab.templatePaths.join("\n")).onChange(async (value) => {
            await this.saveFileTemplateTabs(
              this.plugin.settings.fileTemplateTabs.map((item) => ({
                ...item,
                templatePaths: item.id === tab.id ? normalizeFileTemplateLibraryPaths(value) : item.templatePaths
              }))
            );
          });
          text.inputEl.rows = 4;
        });
    }

    let addInput: HTMLInputElement | null = null;
    new Setting(section)
      .setName(t(lang, "settings.fileTemplateTabAdd"))
      .setDesc(t(lang, "settings.fileTemplateTabAddDesc"))
      .addText((text) => {
        text.setPlaceholder(t(lang, "settings.fileTemplateTabAddPlaceholder"));
        addInput = text.inputEl;
      })
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.projectSendTabAddButton")).onClick(async () => {
          await this.addFileTemplateGroupTab(addInput?.value ?? "");
        });
      });
  }

  private fileTemplateLibraryDefaultTabOptions(): string[] {
    return getVisibleFileTemplateLibraryTabIds(this.plugin.settings.fileTemplateTabs, this.plugin.settings.fileTemplateLibraryTabOrder);
  }

  private getFileTemplateLibraryTabLabel(id: string): string {
    if (id === FILE_TEMPLATE_LIBRARY_TAB_ALL) {
      return t(this.plugin.settings.language, "fileTemplateLibrary.category.all");
    }
    return getFileTemplateLibraryTemplateGroupTab(id, this.plugin.settings.fileTemplateTabs)?.name ?? id;
  }

  private async addFileTemplateGroupTab(value: string): Promise<void> {
    const tab = createTemplateGroupFileTemplateTab(value);
    if (!tab) {
      return;
    }
    const tabs = normalizeFileTemplateTabs([...this.plugin.settings.fileTemplateTabs, tab]);
    await this.saveFileTemplateTabs(tabs);
    this.plugin.settings.fileTemplateLibraryDefaultTabId = normalizeVisibleFileTemplateLibraryDefaultTabId(
      `custom:${tab.id}`,
      this.plugin.settings.fileTemplateTabs
    );
    await this.plugin.persistSettings();
    this.display();
  }

  private async deleteFileTemplateGroupTab(tabId: string): Promise<void> {
    await this.saveFileTemplateTabs(this.plugin.settings.fileTemplateTabs.filter((item) => item.id !== tabId));
    this.display();
  }

  private async saveFileTemplateTabs(tabs: FileTemplateTab[]): Promise<void> {
    const normalized = normalizeFileTemplateTabs(tabs);
    this.plugin.settings.fileTemplateTabs = normalized;
    this.plugin.settings.projectSendTagTabs = projectSendTagTabsFromFileTemplateTabs(normalized);
    this.plugin.settings.projectSendTabOrder = normalizeProjectSendTabOrder(this.plugin.settings.projectSendTabOrder, normalized);
    this.plugin.settings.projectSendHiddenTabs = normalizeProjectSendHiddenTabs(this.plugin.settings.projectSendHiddenTabs, normalized);
    this.plugin.settings.fileTemplateLibraryTabOrder = getVisibleFileTemplateLibraryTabIds(
      normalized,
      this.plugin.settings.fileTemplateLibraryTabOrder
    );
    this.plugin.settings.fileTemplateLibraryDefaultTabId = normalizeVisibleFileTemplateLibraryDefaultTabId(
      this.plugin.settings.fileTemplateLibraryDefaultTabId,
      normalized
    );
    await this.plugin.persistSettings();
  }

  private openManagedTemplateModal(template?: ManagedTemplate): void {
    new TemplateEditorModal(this.app, {
      language: this.plugin.settings.language,
      template,
      onSubmit: async (nextTemplate) => {
        const templates = template
          ? this.plugin.settings.managedTemplates.map((item) => (item.id === template.id ? nextTemplate : item))
          : [...this.plugin.settings.managedTemplates, nextTemplate];
        this.plugin.settings.managedTemplates = normalizeManagedTemplates(templates);
        await this.plugin.persistSettings();
        this.display();
      }
    }).open();
  }

  private async moveManagedTemplate(index: number, delta: number): Promise<void> {
    const target = index + delta;
    const templates = [...this.plugin.settings.managedTemplates];
    if (target < 0 || target >= templates.length) {
      return;
    }
    const [item] = templates.splice(index, 1);
    templates.splice(target, 0, item);
    this.plugin.settings.managedTemplates = templates;
    await this.plugin.persistSettings();
    this.display();
  }

  private renderTasksSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.tasksCompatibility", "settings.tasksCompatibilityDesc");
    new Setting(container)
      .setName(t(lang, "settings.tasksFormatEnabled"))
      .setDesc(t(lang, "settings.tasksFormatEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.tasksFormatEnabled).onChange(async (value) => {
          this.plugin.settings.tasksFormatEnabled = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskPromptOnCreate"))
      .setDesc(t(lang, "settings.taskPromptOnCreateDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskPromptOnCreate).onChange(async (value) => {
          this.plugin.settings.taskPromptOnCreate = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskDefaultSection"))
      .setDesc(t(lang, "settings.taskDefaultSectionDesc"))
      .addDropdown((dropdown) => {
        for (const section of this.plugin.settings.projectSections) {
          dropdown.addOption(section, section);
        }
        dropdown.setValue(this.plugin.settings.taskDefaultSection).onChange(async (value) => {
          this.plugin.settings.taskDefaultSection = normalizeTextSetting(value, DEFAULT_SETTINGS.taskDefaultSection);
          if (!this.plugin.settings.projectSections.includes(this.plugin.settings.taskDefaultSection)) {
            this.plugin.settings.projectSections = [this.plugin.settings.taskDefaultSection, ...this.plugin.settings.projectSections].filter(uniqueNonEmpty);
          }
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskAddCreatedDate"))
      .setDesc(t(lang, "settings.taskAddCreatedDateDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskAddCreatedDate).onChange(async (value) => {
          this.plugin.settings.taskAddCreatedDate = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskAddProjectTag"))
      .setDesc(t(lang, "settings.taskAddProjectTagDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskAddProjectTag).onChange(async (value) => {
          this.plugin.settings.taskAddProjectTag = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskDefaultPriority"))
      .setDesc(t(lang, "settings.taskDefaultPriorityDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", t(lang, "taskPriority.none"))
          .addOption("highest", t(lang, "taskPriority.highest"))
          .addOption("high", t(lang, "taskPriority.high"))
          .addOption("medium", t(lang, "taskPriority.medium"))
          .addOption("low", t(lang, "taskPriority.low"))
          .addOption("lowest", t(lang, "taskPriority.lowest"))
          .setValue(this.plugin.settings.taskDefaultPriority)
          .onChange(async (value) => {
            this.plugin.settings.taskDefaultPriority = normalizeTaskPriority(value);
            await this.plugin.persistSettings();
          });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskDefaultDueDate"))
      .setDesc(t(lang, "settings.taskDefaultDueDateDesc"))
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.plugin.settings.taskDefaultDueDate).onChange(async (value) => {
          this.plugin.settings.taskDefaultDueDate = normalizeTaskDate(value);
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskDefaultScheduledDate"))
      .setDesc(t(lang, "settings.taskDefaultScheduledDateDesc"))
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.plugin.settings.taskDefaultScheduledDate).onChange(async (value) => {
          this.plugin.settings.taskDefaultScheduledDate = normalizeTaskDate(value);
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskDefaultRecurrence"))
      .setDesc(t(lang, "settings.taskDefaultRecurrenceDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", t(lang, "taskRecurrence.none"))
          .addOption("daily", t(lang, "taskRecurrence.daily"))
          .addOption("weekly", t(lang, "taskRecurrence.weekly"))
          .addOption("monthly", t(lang, "taskRecurrence.monthly"))
          .addOption("yearly", t(lang, "taskRecurrence.yearly"))
          .setValue(this.plugin.settings.taskDefaultRecurrence)
          .onChange(async (value) => {
            this.plugin.settings.taskDefaultRecurrence = normalizeTaskRecurrence(value);
            await this.plugin.persistSettings();
          });
    });
    this.renderTaskIndexSummary(container);
    this.renderTaskIndexSettings(container);
  }

  private renderTaskIndexSummary(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const status = this.plugin.taskIndex.getStatus();
    new Setting(container)
      .setName(t(lang, "settings.taskIndexSummary"))
      .setDesc(formatTaskIndexStatus(status, lang, this.plugin.settings.taskVaultFilterEnabled));
  }

  private renderTaskIndexSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.taskIndex", "settings.taskIndexDesc");
    new Setting(container)
      .setName(t(lang, "settings.taskVaultFilterEnabled"))
      .setDesc(t(lang, "settings.taskVaultFilterEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskVaultFilterEnabled).onChange(async (value) => {
          this.plugin.settings.taskVaultFilterEnabled = value;
          await this.plugin.persistSettings();
          if (value && this.plugin.settings.taskIndexEnabled) {
            this.plugin.taskIndex.scheduleBuild(0);
          }
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskIndexEnabled"))
      .setDesc(t(lang, "settings.taskIndexEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskIndexEnabled).onChange(async (value) => {
          this.plugin.settings.taskIndexEnabled = value;
          await this.plugin.persistSettings();
          if (value && this.plugin.settings.taskVaultFilterEnabled) {
            this.plugin.taskIndex.scheduleBuild(0);
          }
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskIndexAutoBuild"))
      .setDesc(t(lang, "settings.taskIndexAutoBuildDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskIndexAutoBuild).onChange(async (value) => {
          this.plugin.settings.taskIndexAutoBuild = value;
          await this.plugin.persistSettings();
        });
      });
    new Setting(container)
      .setName(t(lang, "settings.taskIndexDelayOnMobile"))
      .setDesc(t(lang, "settings.taskIndexDelayOnMobileDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskIndexDelayOnMobile).onChange(async (value) => {
          this.plugin.settings.taskIndexDelayOnMobile = value;
          await this.plugin.persistSettings();
        });
      });
    const status = this.plugin.taskIndex.getStatus();
    new Setting(container)
      .setName(t(lang, "settings.taskIndexStatus"))
      .setDesc(formatTaskIndexStatus(status, lang, this.plugin.settings.taskVaultFilterEnabled))
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.taskIndexRebuild")).onClick(async () => {
          this.plugin.taskIndex.clearCache();
          await this.plugin.taskIndex.rebuild({ force: true });
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText(t(lang, "settings.taskIndexClearCache")).onClick(() => {
          this.plugin.taskIndex.clearCache();
          this.display();
        });
      });
  }

  private renderFilterSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.filterSettings", "settings.filterSettingsDesc");
    new Setting(container)
      .setName(t(lang, "settings.savedSearchCount"))
      .setDesc(t(lang, "settings.savedSearchCountDesc").replace("{count}", String(this.plugin.settings.savedSearches.length)));
    new Setting(container)
      .setName(t(lang, "settings.sidebarItemCount"))
      .setDesc(t(lang, "settings.sidebarItemCountDesc").replace("{count}", String(this.plugin.settings.sidebarItems.length)));
  }

  private renderFilterSidebarSettings(container: HTMLElement): void {
    this.renderDirectoryFilterSettings(container);
  }

  private renderAdvancedSettings(container: HTMLElement): void {
    const lang = this.plugin.settings.language;
    this.renderSectionHeader(container, "settings.advancedSettings", "settings.advancedSettingsDesc");
    new Setting(container)
      .setName(t(lang, "settings.advancedPlaceholder"))
      .setDesc(t(lang, "settings.advancedPlaceholderDesc"));
  }
}

function normalizeDefaultPrefix(value: string): MemoDefaultPrefix {
  if (value === "task" || value === "none") {
    return value;
  }
  return "list";
}

function normalizeDefaultSendAction(value: unknown): DefaultSendAction {
  if (value === "memo" || value === "ask") {
    return value;
  }
  return "project";
}

export function normalizeQuickInputSendAction(value: unknown): DefaultSendAction {
  return normalizeDefaultSendAction(value);
}

export function normalizeQuickInputDirectoryLimit(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export function normalizeQuickCaptureClipboardMode(value: unknown): QuickCaptureClipboardMode {
  if (value === "replace" || value === "append" || value === "off") {
    return value;
  }
  return "ask";
}

export function normalizeQuickCaptureExistingContentMode(value: unknown): QuickCaptureExistingContentMode {
  if (value === "keep" || value === "replace" || value === "append") {
    return value;
  }
  return "ask";
}

export function normalizeLinkAnalysisMaxLinks(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.linkAnalysisMaxLinks;
  }
  return Math.max(1, Math.min(10, Math.floor(parsed)));
}

export function normalizeLinkAnalysisTimeoutMs(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.linkAnalysisTimeoutMs;
  }
  return Math.max(500, Math.min(10000, Math.floor(parsed)));
}

function normalizeVaultPath(value: unknown, fallback: string): string {
  return normalizePath(typeof value === "string" && value.trim() ? value.trim() : fallback);
}

function normalizeTextSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback;
}

function normalizeOptionalVaultPath(value: unknown): string {
  return normalizePath(typeof value === "string" ? value.trim() : "");
}

function normalizeProjectSections(value: unknown): string[] {
  const rawSections = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : DEFAULT_PROJECT_SECTIONS;
  const seen = new Set<string>();
  const sections = rawSections.flatMap((section) => {
    if (typeof section !== "string") {
      return [];
    }
    const normalized = section.trim();
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
  return sections.length > 0 ? sections : DEFAULT_PROJECT_SECTIONS;
}

function normalizeProjectSendTagTabs(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : [];
  const seen = new Set<string>();
  return source.flatMap((item) => {
    const normalized = normalizeFileTag(item);
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
}

const PROJECT_SEND_FIXED_TAB_IDS = ["search"] as const;
const PROJECT_SEND_CUSTOM_TAB_PREFIX = "custom:";

function normalizeProjectSendTabOrder(value: unknown, customTabs: FileTemplateTab[]): string[] {
  const validIds = getProjectSendTabIds(customTabs);
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : DEFAULT_SETTINGS.projectSendTabOrder;
  const seen = new Set<string>();
  const order = source.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }
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

function normalizeProjectSendHiddenTabs(value: unknown, customTabs: FileTemplateTab[]): string[] {
  const validIds = getProjectSendTabIds(customTabs);
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : [];
  const seen = new Set<string>();
  return source.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }
    const id = item.trim();
    if (!validIds.includes(id) || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [id];
  });
}

function getProjectSendTabIds(customTabs: FileTemplateTab[]): string[] {
  return [...PROJECT_SEND_FIXED_TAB_IDS, ...customTabs.map((tab) => getProjectSendCustomTabId(tab.id))];
}

function isProjectSendFixedTab(id: string): id is (typeof PROJECT_SEND_FIXED_TAB_IDS)[number] {
  return (PROJECT_SEND_FIXED_TAB_IDS as readonly string[]).includes(id);
}

function getProjectSendCustomTabId(tag: string): string {
  return `${PROJECT_SEND_CUSTOM_TAB_PREFIX}${tag}`;
}

function getProjectSendCustomTab(id: string, tabs: FileTemplateTab[]): FileTemplateTab | null {
  if (!id.startsWith(PROJECT_SEND_CUSTOM_TAB_PREFIX)) {
    return null;
  }
  const tabId = id.slice(PROJECT_SEND_CUSTOM_TAB_PREFIX.length).trim();
  return tabs.find((tab) => tab.id === tabId) ?? null;
}

function formatProjectSendCustomTabDesc(tab: FileTemplateTab): string {
  if (tab.type === "template-group") {
    return `模板分组页 · ${tab.templatePaths.length} 个模板`;
  }
  return `标签筛选页 · ${tab.tags.map((tag) => `#${tag}`).join(" ")}`;
}

function projectSendTagTabsFromFileTemplateTabs(tabs: FileTemplateTab[]): string[] {
  return normalizeProjectSendTagTabs(tabs.flatMap((tab) => (tab.type === "tag-filter" ? tab.tags : [])));
}

function normalizeRecentProjectPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const normalized = normalizeOptionalVaultPath(item);
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
}

function uniqueNonEmpty(value: string, index: number, array: string[]): boolean {
  return Boolean(value) && array.indexOf(value) === index;
}

function formatTagsForInput(tags: string[]): string {
  return tags.map((tag) => `#${tag}`).join(" ");
}

function formatFileTemplateDefaultsForInput(defaults: Record<string, string>): string {
  return Object.entries(defaults)
    .map(([tag, path]) => `${tag} = ${path}`)
    .join("\n");
}

function formatTaskIndexStatus(status: TaskIndexStatus, lang: Language, vaultFilterEnabled: boolean): string {
  const vaultFilterState = vaultFilterEnabled ? t(lang, "taskIndex.state.enabled") : t(lang, "taskIndex.state.disabled");
  const cacheState = t(lang, `taskIndex.cacheState.${status.cacheState}`);
  const parts = [
    t(lang, "settings.taskIndexStatusVaultFilter").replace("{state}", vaultFilterState),
    status.updating ? t(lang, "taskIndex.updating") : t(lang, "taskIndex.ready"),
    t(lang, "settings.taskIndexStatusCacheState").replace("{state}", cacheState),
    t(lang, "settings.taskIndexStatusTasks").replace("{count}", String(status.indexedTasks)),
    t(lang, "settings.taskIndexStatusFiles").replace("{count}", String(status.indexedFiles))
  ];
  if (status.updatedAt) {
    parts.push(t(lang, "settings.taskIndexStatusUpdatedAt").replace("{time}", new Date(status.updatedAt).toLocaleString()));
  }
  if (status.failedFiles.length > 0) {
    parts.push(t(lang, "settings.taskIndexStatusFailed").replace("{count}", String(status.failedFiles.length)));
  }
  return parts.join(" · ");
}

function migrateLegacyMobileHomeLayout(layout: MobileHomeLayout, customModules: MobileHomeCustomModules): ViewLayoutSettings {
  if (layout === "minimal") {
    return normalizeViewLayout({ mode: "minimal" }, "mobile");
  }
  if (layout === "sidebar-only") {
    return normalizeViewLayout({ mode: "navigation" }, "mobile");
  }
  if (layout === "sidebar-composer") {
    return normalizeViewLayout(
      {
        mode: "custom",
        visibleModules: [
          "quickInput",
          "inputToolbar",
          "sendButton",
          "moreMenu",
          "allNotes",
          "projectDirectory",
          "projectFilters",
          "organizeDirectory",
          "taskDirectory",
          "tagFilters",
          "settingsButton",
          "refreshButton"
        ]
      },
      "mobile"
    );
  }
  if (layout === "composer-recent") {
    return normalizeViewLayout(
      {
        mode: "custom",
        visibleModules: ["quickInput", "inputToolbar", "sendButton", "moreMenu", "fileCount", "fileList"]
      },
      "mobile"
    );
  }
  if (layout === "full") {
    return normalizeViewLayout({ mode: "full" }, "mobile");
  }
  return normalizeViewLayout({ mode: "custom", visibleModules: legacyMobileCustomModulesToDisplayModules(customModules) }, "mobile");
}

function legacyMobileCustomModulesToDisplayModules(modules: MobileHomeCustomModules): DisplayModuleId[] {
  const visible: DisplayModuleId[] = [];
  const add = (...ids: DisplayModuleId[]) => {
    for (const id of ids) {
      if (!visible.includes(id)) {
        visible.push(id);
      }
    }
  };
  if (modules.composer) {
    add("quickInput", "inputToolbar", "sendButton", "moreMenu");
  }
  if (modules.sidebar) {
    add("allNotes", "projectDirectory", "projectFilters");
  }
  if (modules.organizer) {
    add("organizeDirectory");
  }
  if (modules.tasks) {
    add("taskDirectory");
  }
  if (modules.tags) {
    add("tagFilters");
  }
  if (modules.memoList || modules.recent) {
    add("fileCount", "fileList");
  }
  if (modules.heatmap) {
    add("heatmap");
  }
  if (modules.stats) {
    add("statsCards");
  }
  if (modules.search) {
    add("searchBox");
  }
  if (modules.refresh) {
    add("refreshButton");
  }
  if (visible.length > 0) {
    add("settingsButton");
  }
  return visible;
}

function parseFileTemplateDefaultsInput(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [tagPart, ...pathParts] = trimmed.split(/[=＝:：]/);
    const tag = normalizeFileTag(tagPart);
    const path = normalizeOptionalVaultPath(pathParts.join("=").trim());
    if (tag && path) {
      result[tag] = path;
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
