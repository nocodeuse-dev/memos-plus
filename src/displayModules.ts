export const DISPLAY_SURFACES = ["home", "sidebar", "mobile"] as const;
export type DisplaySurface = (typeof DISPLAY_SURFACES)[number];

export type DisplayModuleId =
  | "quickInput"
  | "inputToolbar"
  | "sendButton"
  | "searchBox"
  | "allNotes"
  | "projectDirectory"
  | "projectFilters"
  | "organizeDirectory"
  | "taskDirectory"
  | "tagFilters"
  | "fileCount"
  | "fileList"
  | "heatmap"
  | "statsCards"
  | "settingsButton"
  | "refreshButton"
  | "moreMenu";

export type DisplayLayoutMode = "full" | "quick-input" | "navigation" | "project" | "task" | "minimal" | "custom";
export type DisplayPerformanceCost = "low" | "medium" | "high";
export type DisplayModuleDependency = "memos" | "sidebar" | "organizer" | "tasks" | "vaultIndex" | "stats";
export type DisplayModuleDataNeed = DisplayModuleDependency;

export interface DisplayModuleDefinition {
  id: DisplayModuleId;
  name: string;
  description: string;
  supportedSurfaces: DisplaySurface[];
  defaultVisible: boolean;
  dependencies: DisplayModuleDependency[];
  performanceCost: DisplayPerformanceCost;
  render?: DisplayModuleRenderer;
  loadData?: DisplayModuleDataLoader;
}

export type DisplayModuleRenderer = (context: unknown) => void;
export type DisplayModuleDataLoader = (context: unknown) => unknown | Promise<unknown>;

export interface ViewLayoutSettings {
  mode: DisplayLayoutMode;
  visibleModules: DisplayModuleId[];
  order: DisplayModuleId[];
  compactMode: boolean;
}

export type ViewLayoutsSettings = Record<DisplaySurface, ViewLayoutSettings>;

export const DISPLAY_MODULE_REGISTRY: DisplayModuleDefinition[] = [
  module("quickInput", "快速输入框", "用于快速记录内容的输入区域。", ["home", "sidebar", "mobile"], true, [], "low"),
  module("inputToolbar", "输入工具栏", "标签、图片、列表、任务、折叠块等输入工具。", ["home", "sidebar", "mobile"], true, [], "low"),
  module("sendButton", "发送按钮", "执行默认发送或打开投递流程。", ["home", "sidebar", "mobile"], true, [], "low"),
  module("searchBox", "搜索框", "搜索当前笔记或文件结果。", ["home", "mobile"], true, ["memos"], "low"),
  module("allNotes", "全部笔记", "显示全部笔记入口。", ["home", "sidebar", "mobile"], true, ["memos"], "low"),
  module("projectDirectory", "项目目录", "显示项目目录分组。", ["home", "sidebar", "mobile"], true, ["sidebar", "vaultIndex"], "medium"),
  module("projectFilters", "项目筛选器", "显示项目相关筛选项。", ["home", "sidebar", "mobile"], true, ["sidebar", "vaultIndex"], "medium"),
  module("organizeDirectory", "任务管理", "显示待整理、今日新增、链接、图片等任务管理入口。", ["home", "sidebar", "mobile"], true, ["organizer"], "medium"),
  module("taskDirectory", "任务管理任务项", "显示未完成任务和任务优先级/到期分支。", ["home", "sidebar", "mobile"], true, ["tasks"], "high"),
  module("tagFilters", "标签筛选", "显示标签和自定义标签筛选。", ["home", "sidebar", "mobile"], true, ["memos", "vaultIndex"], "medium"),
  module("fileCount", "文件数量", "显示当前筛选结果数量。", ["home", "sidebar", "mobile"], true, ["memos"], "low"),
  module("fileList", "文件列表", "显示 memo、任务或文件结果列表。", ["home", "sidebar", "mobile"], true, ["memos"], "medium"),
  module("heatmap", "热力图", "显示记录热力图。", ["home", "mobile"], true, ["memos", "stats"], "high"),
  module("statsCards", "统计卡片", "显示笔记、标签、天数、今日和待办数量。", ["home", "mobile"], true, ["memos", "stats"], "medium"),
  module("settingsButton", "设置按钮", "打开 Memos Plus 设置。", ["home", "sidebar", "mobile"], true, [], "low"),
  module("refreshButton", "刷新按钮", "重新加载当前数据。", ["home", "sidebar", "mobile"], true, [], "low"),
  module("moreMenu", "更多菜单", "收纳低频输入工具或页面操作。", ["home", "sidebar", "mobile"], true, [], "low")
];

export const DISPLAY_MODULE_IDS = DISPLAY_MODULE_REGISTRY.map((definition) => definition.id);
export const DISPLAY_LAYOUT_MODES: DisplayLayoutMode[] = ["full", "quick-input", "navigation", "project", "task", "minimal", "custom"];
const DISPLAY_DATA_NEED_ORDER: DisplayModuleDataNeed[] = ["sidebar", "memos", "organizer", "tasks", "vaultIndex", "stats"];

export const DEFAULT_VIEW_LAYOUTS: ViewLayoutsSettings = {
  home: normalizeViewLayout({ mode: "full" }, "home"),
  sidebar: normalizeViewLayout({ mode: "quick-input" }, "sidebar"),
  mobile: normalizeViewLayout({ mode: "navigation" }, "mobile")
};

export function getDisplayModule(id: string): DisplayModuleDefinition | undefined {
  return DISPLAY_MODULE_REGISTRY.find((definition) => definition.id === id);
}

export function modulesForSurface(surface: DisplaySurface): DisplayModuleDefinition[] {
  return DISPLAY_MODULE_REGISTRY.filter((definition) => definition.supportedSurfaces.includes(surface));
}

export function isSidebarDirectoryModule(moduleId: DisplayModuleId): boolean {
  return (
    moduleId === "allNotes" ||
    moduleId === "projectDirectory" ||
    moduleId === "projectFilters" ||
    moduleId === "organizeDirectory" ||
    moduleId === "taskDirectory" ||
    moduleId === "tagFilters" ||
    moduleId === "fileCount" ||
    moduleId === "fileList"
  );
}

export function hasSidebarDirectoryModules(modules: ReadonlySet<DisplayModuleId>): boolean {
  for (const moduleId of modules) {
    if (isSidebarDirectoryModule(moduleId)) {
      return true;
    }
  }
  return false;
}

export function normalizeViewLayouts(value: unknown): ViewLayoutsSettings {
  const raw = isRecord(value) ? value : {};
  return DISPLAY_SURFACES.reduce((layouts, surface) => {
    layouts[surface] = normalizeViewLayout(raw[surface], surface);
    return layouts;
  }, {} as ViewLayoutsSettings);
}

export function normalizeViewLayout(value: unknown, surface: DisplaySurface): ViewLayoutSettings {
  if (!isRecord(value)) {
    const mode = defaultModeForSurface(surface);
    const visibleModules = resolvePresetModules(mode, surface);
    return {
      mode,
      visibleModules,
      order: visibleModules,
      compactMode: defaultCompactModeForSurface(surface)
    };
  }
  const raw = isRecord(value) ? value : {};
  const mode = normalizeDisplayLayoutMode(raw.mode);
  const compactMode = typeof raw.compactMode === "boolean" ? raw.compactMode : defaultCompactModeForSurface(surface);
  const visibleModules = mode === "custom" ? normalizeVisibleModules(raw.visibleModules, surface) : resolvePresetModules(mode, surface);
  const order = normalizeModuleOrder(raw.order, surface, visibleModules);
  if (mode === "custom") {
    return { mode, visibleModules, order, compactMode };
  }
  return { mode, visibleModules, order, compactMode };
}

export function normalizeDisplayLayoutMode(value: unknown): DisplayLayoutMode {
  return typeof value === "string" && (DISPLAY_LAYOUT_MODES as string[]).includes(value) ? (value as DisplayLayoutMode) : "custom";
}

export function resolveViewLayoutModules(layout: ViewLayoutSettings, surface: DisplaySurface): DisplayModuleId[] {
  const visibleModules = layout.mode === "custom" ? normalizeVisibleModules(layout.visibleModules, surface) : resolvePresetModules(layout.mode, surface);
  return normalizeModuleOrder(layout.order, surface, visibleModules);
}

export function resolveViewLayoutDataNeeds(layout: ViewLayoutSettings, surface: DisplaySurface): DisplayModuleDataNeed[] {
  const needs = new Set<DisplayModuleDataNeed>();
  for (const moduleId of resolveViewLayoutModules(layout, surface)) {
    const definition = getDisplayModule(moduleId);
    if (!definition) {
      continue;
    }
    for (const dependency of definition.dependencies) {
      needs.add(dependency);
    }
  }
  return DISPLAY_DATA_NEED_ORDER.filter((need) => needs.has(need));
}

export function viewLayoutsNeedData(layouts: ViewLayoutsSettings, need: DisplayModuleDataNeed): boolean {
  return DISPLAY_SURFACES.some((surface) => resolveViewLayoutDataNeeds(layouts[surface], surface).includes(need));
}

export function copyViewLayoutToSurface(layout: ViewLayoutSettings, surface: DisplaySurface): ViewLayoutSettings {
  return normalizeViewLayout(
    {
      mode: layout.mode,
      visibleModules: layout.mode === "custom" ? layout.visibleModules : resolveViewLayoutModules(layout, surface),
      order: layout.order,
      compactMode: layout.compactMode
    },
    surface
  );
}

export function sameViewLayoutForAllSurfaces(layout: ViewLayoutSettings): ViewLayoutsSettings {
  return DISPLAY_SURFACES.reduce((layouts, surface) => {
    layouts[surface] = copyViewLayoutToSurface(layout, surface);
    return layouts;
  }, {} as ViewLayoutsSettings);
}

function resolvePresetModules(mode: DisplayLayoutMode, surface: DisplaySurface): DisplayModuleId[] {
  const supported = new Set(modulesForSurface(surface).map((definition) => definition.id));
  const modules =
    mode === "full"
      ? DISPLAY_MODULE_IDS
      : mode === "quick-input"
        ? ["quickInput", "inputToolbar", "sendButton", "settingsButton", "moreMenu"]
        : mode === "navigation"
          ? ["allNotes", "projectDirectory", "projectFilters", "organizeDirectory", "taskDirectory", "tagFilters", "settingsButton", "refreshButton"]
          : mode === "project"
            ? ["projectDirectory", "projectFilters", "fileCount", "fileList", "settingsButton", "refreshButton"]
            : mode === "task"
              ? ["taskDirectory", "fileCount", "fileList", "settingsButton", "refreshButton"]
              : mode === "minimal"
                ? ["quickInput", "sendButton", "moreMenu"]
                : [];
  return modules.filter((id): id is DisplayModuleId => supported.has(id as DisplayModuleId));
}

function defaultModeForSurface(surface: DisplaySurface): DisplayLayoutMode {
  if (surface === "home") {
    return "full";
  }
  if (surface === "sidebar") {
    return "quick-input";
  }
  return "navigation";
}

function defaultCompactModeForSurface(surface: DisplaySurface): boolean {
  return surface !== "home";
}

function normalizeVisibleModules(value: unknown, surface: DisplaySurface): DisplayModuleId[] {
  const supported = new Set(modulesForSurface(surface).map((definition) => definition.id));
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<DisplayModuleId>();
  const modules: DisplayModuleId[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !supported.has(item as DisplayModuleId)) {
      continue;
    }
    const id = item as DisplayModuleId;
    if (!seen.has(id)) {
      seen.add(id);
      modules.push(id);
    }
  }
  return modules;
}

function normalizeModuleOrder(value: unknown, surface: DisplaySurface, visibleModules: DisplayModuleId[]): DisplayModuleId[] {
  const supported = new Set(modulesForSurface(surface).map((definition) => definition.id));
  const visible = new Set(visibleModules);
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<DisplayModuleId>();
  const ordered: DisplayModuleId[] = [];
  for (const item of source) {
    if (typeof item !== "string" || !supported.has(item as DisplayModuleId) || !visible.has(item as DisplayModuleId)) {
      continue;
    }
    const id = item as DisplayModuleId;
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const id of visibleModules) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

function module(
  id: DisplayModuleId,
  name: string,
  description: string,
  supportedSurfaces: DisplaySurface[],
  defaultVisible: boolean,
  dependencies: DisplayModuleDependency[],
  performanceCost: DisplayPerformanceCost
): DisplayModuleDefinition {
  return {
    id,
    name,
    description,
    supportedSurfaces,
    defaultVisible,
    dependencies,
    performanceCost
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
