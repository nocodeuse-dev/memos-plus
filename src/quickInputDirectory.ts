import { filterMemos } from "./filter";
import type { MemoItem } from "./markdown";
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
  const entries: QuickInputDirectoryEntry[] = [
    {
      type: "all",
      id: "all",
      title: "全部笔记",
      icon: settings.allMemosIcon || "layout-grid",
      count: includeCounts ? visibleMemos(settings, memos, options.today).length : ""
    },
    ...sidebarItemsToEntries(settings.sidebarItems, settings, memos, savedSearches, options.today, includeCounts)
  ];
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
