import {
  createDefaultSavedSearchCondition,
  createSavedSearchId,
  type SavedSearch,
  type SavedSearchCondition
} from "./savedSearch";

export const DEFAULT_SIDEBAR_GROUP_ID = "default-searches";

export type SidebarItem = SidebarGroupItem | SidebarSearchItem;

export interface SidebarGroupItem {
  id: string;
  type: "group";
  title: string;
  icon: string;
  collapsed: boolean;
  children: SidebarItem[];
}

export interface SidebarSearchItem {
  id: string;
  type: "search";
  title: string;
  icon: string;
  searchId: string;
}

export type SavedSearchTemplateId =
  | "pinned"
  | "starred"
  | "today"
  | "week"
  | "todo"
  | "archived"
  | "untagged"
  | "images"
  | "links"
  | "year"
  | "tag"
  | "custom";

export interface SavedSearchTemplateOptions {
  id?: string;
  name?: string;
  value?: string;
}

export function normalizeSidebarItems(value: unknown, savedSearches: SavedSearch[]): SidebarItem[] {
  const searchIds = new Set(savedSearches.map((search) => search.id));
  if (!Array.isArray(value)) {
    return savedSearches.length > 0 ? [createLegacyDefaultGroup(savedSearches)] : [];
  }
  return value.flatMap((item) => normalizeSidebarItem(item, searchIds));
}

export function createSidebarGroup(id: string, title: string, icon = "folder", children: SidebarItem[] = [], collapsed = false): SidebarGroupItem {
  return {
    id,
    type: "group",
    title,
    icon,
    collapsed,
    children
  };
}

export function createSidebarSearchItem(id: string, title: string, icon: string, searchId: string): SidebarSearchItem {
  return {
    id,
    type: "search",
    title,
    icon,
    searchId
  };
}

export function createSavedSearchFromTemplate(template: SavedSearchTemplateId, options: SavedSearchTemplateOptions = {}): SavedSearch {
  const id = options.id ?? createSavedSearchId();
  const name = options.name ?? defaultTemplateName(template, options.value);
  return {
    id,
    name,
    match: "all",
    searchScope: "memos",
    conditions: conditionsForTemplate(template, options.value)
  };
}

export function defaultIconForTemplate(template: SavedSearchTemplateId): string {
  switch (template) {
    case "pinned":
      return "pin";
    case "starred":
      return "star";
    case "today":
      return "calendar-days";
    case "week":
      return "calendar-range";
    case "todo":
      return "list-checks";
    case "archived":
      return "archive";
    case "untagged":
    case "tag":
      return "tag";
    case "images":
      return "image";
    case "links":
      return "link";
    case "year":
      return "calendar";
    case "custom":
      return "filter";
  }
}

function createLegacyDefaultGroup(savedSearches: SavedSearch[]): SidebarGroupItem {
  return createSidebarGroup(
    DEFAULT_SIDEBAR_GROUP_ID,
    "检索式",
    "folder",
    savedSearches.map((search) => createSidebarSearchItem(`item-${search.id}`, search.name, "filter", search.id))
  );
}

function normalizeSidebarItem(value: unknown, searchIds: Set<string>): SidebarItem[] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") {
    return [];
  }
  const id = value.id.trim();
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : "";
  const icon = typeof value.icon === "string" && value.icon.trim() ? value.icon.trim() : "";
  if (!id || !title) {
    return [];
  }
  if (value.type === "search") {
    const searchId = typeof value.searchId === "string" ? value.searchId.trim() : "";
    if (!searchId || !searchIds.has(searchId)) {
      return [];
    }
    return [createSidebarSearchItem(id, title, icon || "filter", searchId)];
  }
  if (value.type === "group") {
    const children = Array.isArray(value.children) ? value.children.flatMap((child) => normalizeSidebarItem(child, searchIds)) : [];
    return [createSidebarGroup(id, title, icon || "folder", children, value.collapsed === true)];
  }
  return [];
}

function conditionsForTemplate(template: SavedSearchTemplateId, value?: string): SavedSearchCondition[] {
  switch (template) {
    case "pinned":
      return [{ field: "status", operator: "equals", value: "pinned" }];
    case "starred":
      return [{ field: "status", operator: "equals", value: "starred" }];
    case "today":
      return [{ field: "date", operator: "equals", value: "$today" }];
    case "week":
      return [{ field: "date", operator: "between", value: "$weekStart", valueTo: "$weekEnd" }];
    case "todo":
      return [{ field: "taskStatus", operator: "equals", value: "open" }];
    case "archived":
      return [{ field: "status", operator: "equals", value: "archived" }];
    case "untagged":
      return [{ field: "tag", operator: "notExists" }];
    case "images":
      return [{ field: "image", operator: "exists" }];
    case "links":
      return [{ field: "link", operator: "exists" }];
    case "year":
      return [{ field: "year", operator: "equals", value: value?.trim() ?? "" }];
    case "tag":
      return [{ field: "tag", operator: "equals", value: normalizeTagValue(value) }];
    case "custom":
      return [createDefaultSavedSearchCondition()];
  }
}

function defaultTemplateName(template: SavedSearchTemplateId, value?: string): string {
  switch (template) {
    case "pinned":
      return "置顶";
    case "starred":
      return "收藏";
    case "today":
      return "今天";
    case "week":
      return "本周";
    case "todo":
      return "待办";
    case "archived":
      return "归档";
    case "untagged":
      return "无标签";
    case "images":
      return "有图片";
    case "links":
      return "有链接";
    case "year":
    case "tag":
      return normalizeTagValue(value) || "自定义筛选";
    case "custom":
      return "自定义筛选";
  }
}

function normalizeTagValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/^#/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
