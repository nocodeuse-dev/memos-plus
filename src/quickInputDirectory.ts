import { filterMemos, getAllTags } from "./filter";
import type { DisplayModuleId } from "./displayModules";
import { t } from "./i18n";
import type { MemoItem } from "./markdown";
import {
  buildOrganizerPanelSections,
  filterMemosForOrganizerFilter,
  organizerFilterLabelKey,
  type OrganizerFilterId
} from "./organizerPanel";
import { filterMemosBySavedSearch, savedSearchIncludesArchivedCondition, type SavedSearch } from "./savedSearch";
import type { MemosPlusSettings } from "./settings";
import type { SidebarGroupItem, SidebarItem, SidebarSearchItem } from "./sidebar";

export type QuickInputDirectoryEntry =
  | {
      type: "all";
      id: "all";
      title: string;
      icon: string;
      count: number | string;
    }
  | {
      type: "group";
      id: string;
      title: string;
      icon: string;
      count: number | string;
      item: SidebarGroupItem;
      children: QuickInputDirectoryEntry[];
    }
  | {
      type: "search";
      id: string;
      title: string;
      icon: string;
      count: number | string;
      item: SidebarSearchItem;
      search: SavedSearch | null;
    }
  | {
      type: "organizer";
      id: string;
      title: string;
      icon: string;
      count: number | string;
      filterId: OrganizerFilterId;
    }
  | {
      type: "tag";
      id: string;
      title: string;
      icon: string;
      count: number | string;
      tag: string;
    };

export type QuickInputPreviewItem =
  | {
      type: "memo";
      id: string;
      title: string;
      subtitle: string;
      memo: MemoItem;
    }
  | {
      type: "entry";
      id: string;
      title: string;
      subtitle: string;
      icon: string;
      entry: QuickInputDirectoryEntry;
    }
  | {
      type: "file";
      id: string;
      title: string;
      subtitle: string;
      path: string;
      tags: string[];
      modifiedTime: number;
      excerpt: string;
    };

export interface QuickInputDirectoryOptions {
  today: string;
  limit: number;
  includeCounts?: boolean;
  visibleModules?: ReadonlySet<DisplayModuleId>;
  moduleOrder?: readonly DisplayModuleId[];
}

export interface QuickInputDirectoryPreview {
  items: QuickInputPreviewItem[];
  total: number;
}

export function buildQuickInputDirectoryEntries(
  settings: MemosPlusSettings,
  memos: MemoItem[],
  options: QuickInputDirectoryOptions
): QuickInputDirectoryEntry[] {
  const savedSearches = new Map(settings.savedSearches.map((search) => [search.id, search]));
  const includeCounts = options.includeCounts !== false;
  const entries: QuickInputDirectoryEntry[] = [];
  const modules = options.visibleModules ?? null;
  const moduleOrder = options.moduleOrder ?? (modules ? [...modules] : ["allNotes", "projectDirectory"] satisfies DisplayModuleId[]);
  const rendered = new Set<string>();

  for (const moduleId of moduleOrder) {
    if (moduleId === "allNotes" && shouldRenderModule(modules, "allNotes") && !rendered.has("allNotes")) {
      rendered.add("allNotes");
      entries.push({
        type: "all",
        id: "all",
        title: "全部笔记",
        icon: settings.allMemosIcon || "layout-grid",
        count: includeCounts ? visibleMemos(settings, memos, options.today).length : ""
      });
      continue;
    }
    if (isCustomDirectoryModule(moduleId) && shouldRenderCustomDirectory(modules) && !rendered.has("customDirectory")) {
      rendered.add("customDirectory");
      entries.push(...sidebarItemsToEntries(settings.sidebarItems, settings, memos, savedSearches, options.today, includeCounts));
      continue;
    }
    if ((moduleId === "organizeDirectory" || moduleId === "taskDirectory") && !rendered.has("organizer")) {
      rendered.add("organizer");
      entries.push(...organizerEntries(settings, memos, options.today, includeCounts, modules));
      continue;
    }
    if (moduleId === "tagFilters" && shouldRenderModule(modules, "tagFilters") && !rendered.has("tagFilters")) {
      rendered.add("tagFilters");
      entries.push(...tagEntries(settings, memos, options.today, includeCounts));
    }
  }
  return entries.slice(0, Math.max(1, options.limit));
}

export function buildQuickInputDirectoryPreview(
  entry: QuickInputDirectoryEntry,
  settings: MemosPlusSettings,
  memos: MemoItem[],
  options: QuickInputDirectoryOptions
): QuickInputDirectoryPreview {
  if (entry.type === "all") {
    return memoPreview(visibleMemos(settings, memos, options.today), options.limit);
  }
  if (entry.type === "search") {
    if (!entry.search || entry.search.searchScope === "vault") {
      return { items: [], total: 0 };
    }
    return memoPreview(filterSearchMemos(settings, memos, entry.search, options.today), options.limit);
  }
  if (entry.type === "organizer") {
    return memoPreview(
      filterMemosForOrganizerFilter(entry.filterId, memos, {
        today: options.today,
        states: settings.organizerMemoStates
      }),
      options.limit
    );
  }
  if (entry.type === "tag") {
    return memoPreview(tagMemos(settings, memos, entry.tag, options.today), options.limit);
  }
  return memoPreview(memosForGroup(entry, settings, memos, options.today), options.limit);
}

export function collectQuickInputDirectoryVaultSearches(entry: QuickInputDirectoryEntry): SavedSearch[] {
  if (entry.type === "search") {
    return entry.search?.searchScope === "vault" ? [entry.search] : [];
  }
  if (entry.type === "group") {
    return entry.children.flatMap(collectQuickInputDirectoryVaultSearches);
  }
  return [];
}

function shouldRenderModule(modules: ReadonlySet<DisplayModuleId> | null, moduleId: DisplayModuleId): boolean {
  return !modules || modules.has(moduleId);
}

function isCustomDirectoryModule(moduleId: DisplayModuleId): boolean {
  return moduleId === "projectDirectory" || moduleId === "projectFilters";
}

function shouldRenderCustomDirectory(modules: ReadonlySet<DisplayModuleId> | null): boolean {
  return !modules || modules.has("projectDirectory") || modules.has("projectFilters");
}

function organizerEntries(
  settings: MemosPlusSettings,
  memos: MemoItem[],
  today: string,
  includeCounts: boolean,
  modules: ReadonlySet<DisplayModuleId> | null
): QuickInputDirectoryEntry[] {
  if (!settings.organizerPanelEnabled) {
    return [];
  }
  const showSections = shouldRenderModule(modules, "organizeDirectory");
  const showTasks = shouldRenderModule(modules, "taskDirectory");
  if (!showSections && !showTasks) {
    return [];
  }
  return buildOrganizerPanelSections(memos, {
    today,
    states: settings.organizerMemoStates,
    sectionSettings: settings.organizerPanelSections,
    limit: 0
  })
    .filter((section) => (section.id === "tasks" ? showTasks : showSections))
    .map((section) => ({
      type: "organizer" as const,
      id: `organizer:${section.id}`,
      title: t(settings.language, organizerFilterLabelKey(section.id)),
      icon: section.icon,
      count: includeCounts ? section.total : "",
      filterId: section.id
    }));
}

function tagEntries(settings: MemosPlusSettings, memos: MemoItem[], today: string, includeCounts: boolean): QuickInputDirectoryEntry[] {
  return getAllTags(memos).map((tag) => ({
    type: "tag" as const,
    id: `tag:${tag}`,
    title: `#${tag}`,
    icon: "tag",
    count: includeCounts ? tagMemos(settings, memos, tag, today).length : "",
    tag
  }));
}

function sidebarItemsToEntries(
  items: SidebarItem[],
  settings: MemosPlusSettings,
  memos: MemoItem[],
  savedSearches: Map<string, SavedSearch>,
  today: string,
  includeCounts: boolean
): QuickInputDirectoryEntry[] {
  const entries: QuickInputDirectoryEntry[] = [];
  for (const item of items) {
    const entry = sidebarItemToEntry(item, settings, memos, savedSearches, today, includeCounts);
    entries.push(entry, ...flattenDirectoryEntry(entry));
  }
  return entries;
}

function sidebarItemToEntry(
  item: SidebarItem,
  settings: MemosPlusSettings,
  memos: MemoItem[],
  savedSearches: Map<string, SavedSearch>,
  today: string,
  includeCounts: boolean
): QuickInputDirectoryEntry {
  if (item.type === "search") {
    const search = savedSearches.get(item.searchId) ?? null;
    return {
      type: "search",
      id: item.id,
      title: item.title,
      icon: item.icon || "filter",
      count: includeCounts && search ? countForSearch(settings, memos, search, today) : "",
      item,
      search
    };
  }
  const children = item.children.map((child) => sidebarItemToEntry(child, settings, memos, savedSearches, today, includeCounts));
  return {
    type: "group",
    id: item.id,
    title: item.title,
    icon: item.icon || "folder",
    count: includeCounts ? countForChildren(children) : "",
    item,
    children
  };
}

function flattenDirectoryEntry(entry: QuickInputDirectoryEntry): QuickInputDirectoryEntry[] {
  if (entry.type !== "group") {
    return [];
  }
  return entry.children.flatMap((child) => [child, ...flattenDirectoryEntry(child)]);
}

function visibleMemos(settings: MemosPlusSettings, memos: MemoItem[], today: string): MemoItem[] {
  return filterMemos(memos, {
    view: "all",
    today,
    showArchived: settings.showArchived,
    sortOrder: settings.sortOrder
  });
}

function filterSearchMemos(settings: MemosPlusSettings, memos: MemoItem[], search: SavedSearch, today: string): MemoItem[] {
  const baseMemos = filterMemos(memos, {
    view: "all",
    today,
    showArchived: settings.showArchived || savedSearchIncludesArchivedCondition(search),
    sortOrder: settings.sortOrder
  });
  return filterMemosBySavedSearch(baseMemos, search, { today });
}

function tagMemos(settings: MemosPlusSettings, memos: MemoItem[], tag: string, today: string): MemoItem[] {
  return filterMemos(memos, {
    view: "all",
    today,
    tag,
    showArchived: settings.showArchived,
    sortOrder: settings.sortOrder
  });
}

function memosForGroup(entry: Extract<QuickInputDirectoryEntry, { type: "group" }>, settings: MemosPlusSettings, memos: MemoItem[], today: string): MemoItem[] {
  const seen = new Set<string>();
  const results: MemoItem[] = [];
  for (const child of entry.children) {
    const childMemos = child.type === "search" && child.search?.searchScope === "memos" ? filterSearchMemos(settings, memos, child.search, today) : child.type === "group" ? memosForGroup(child, settings, memos, today) : [];
    for (const memo of childMemos) {
      if (seen.has(memo.id)) {
        continue;
      }
      seen.add(memo.id);
      results.push(memo);
    }
  }
  return results.sort((left, right) => right.datetime.getTime() - left.datetime.getTime());
}

function countForSearch(settings: MemosPlusSettings, memos: MemoItem[], search: SavedSearch, today: string): number | string {
  if (search.searchScope === "vault") {
    return "...";
  }
  return filterSearchMemos(settings, memos, search, today).length;
}

function countForChildren(children: QuickInputDirectoryEntry[]): number | string {
  let total = 0;
  for (const child of children) {
    if (typeof child.count !== "number") {
      return "...";
    }
    total += child.count;
  }
  return total;
}

function memoPreview(memos: MemoItem[], limit: number): QuickInputDirectoryPreview {
  return {
    items: memos.slice(0, Math.max(1, limit)).map((memo) => ({
      type: "memo",
      id: memo.id,
      title: memoTitle(memo),
      subtitle: `${memo.date} ${memo.time}`,
      memo
    })),
    total: memos.length
  };
}

function memoTitle(memo: MemoItem): string {
  const firstLine = memo.content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : `${memo.date} ${memo.time}`;
}
