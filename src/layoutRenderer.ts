import {
  resolveViewLayoutModules,
  type DisplayModuleId,
  type DisplaySurface,
  type ViewLayoutSettings
} from "./displayModules";

export const COMPOSER_LAYOUT_GROUP: readonly DisplayModuleId[] = ["quickInput", "inputToolbar", "sendButton", "moreMenu"];
export const HOME_TOOLBAR_LAYOUT_GROUP: readonly DisplayModuleId[] = ["searchBox", "settingsButton", "refreshButton"];
export const HOME_RESULTS_LAYOUT_GROUP: readonly DisplayModuleId[] = ["fileList", "fileCount"];
export const SIDEBAR_NAVIGATION_LAYOUT_GROUP: readonly DisplayModuleId[] = [
  "allNotes",
  "projectDirectory",
  "projectFilters",
  "organizeDirectory",
  "taskDirectory",
  "tagFilters"
];
export const QUICK_INPUT_DIRECTORY_LAYOUT_GROUP: readonly DisplayModuleId[] = [
  ...SIDEBAR_NAVIGATION_LAYOUT_GROUP,
  "fileCount",
  "fileList"
];

export interface LayoutSurfaceModules {
  orderedModules: DisplayModuleId[];
  modules: ReadonlySet<DisplayModuleId>;
}

export interface LayoutModuleRenderContext extends LayoutSurfaceModules {
  surface: DisplaySurface;
  layout: ViewLayoutSettings;
  moduleId: DisplayModuleId;
  index: number;
}

export interface LayoutGroupRenderContext extends LayoutSurfaceModules {
  surface: DisplaySurface;
  layout: ViewLayoutSettings;
  groupId: string;
  triggerModuleId: DisplayModuleId;
  groupModules: readonly DisplayModuleId[];
  index: number;
}

export interface RenderLayoutSurfaceOptions {
  surface: DisplaySurface;
  layout: ViewLayoutSettings;
  groups?: Record<string, readonly DisplayModuleId[]>;
  renderModule: (context: LayoutModuleRenderContext) => void | Promise<void>;
  renderGroup?: (context: LayoutGroupRenderContext) => void | Promise<void>;
}

export function resolveLayoutSurfaceModules(layout: ViewLayoutSettings, surface: DisplaySurface): LayoutSurfaceModules {
  const orderedModules = resolveViewLayoutModules(layout, surface);
  return {
    orderedModules,
    modules: new Set(orderedModules)
  };
}

export async function renderLayoutSurface(options: RenderLayoutSurfaceOptions): Promise<LayoutSurfaceModules> {
  const resolved = resolveLayoutSurfaceModules(options.layout, options.surface);
  const renderedGroups = new Set<string>();
  for (let index = 0; index < resolved.orderedModules.length; index += 1) {
    const moduleId = resolved.orderedModules[index];
    const group = options.renderGroup ? findGroupForModule(options.groups, moduleId) : null;
    if (group) {
      const [groupId, groupModules] = group;
      if (renderedGroups.has(groupId)) {
        continue;
      }
      renderedGroups.add(groupId);
      await options.renderGroup?.({
        ...resolved,
        surface: options.surface,
        layout: options.layout,
        groupId,
        triggerModuleId: moduleId,
        groupModules,
        index
      });
      continue;
    }
    await options.renderModule({
      ...resolved,
      surface: options.surface,
      layout: options.layout,
      moduleId,
      index
    });
  }
  return resolved;
}

function findGroupForModule(
  groups: Record<string, readonly DisplayModuleId[]> | undefined,
  moduleId: DisplayModuleId
): [string, readonly DisplayModuleId[]] | null {
  if (!groups) {
    return null;
  }
  for (const [groupId, groupModules] of Object.entries(groups)) {
    if (groupModules.includes(moduleId)) {
      return [groupId, groupModules];
    }
  }
  return null;
}
